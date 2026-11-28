// Reader/writer for the CrystalShireEngine (pokecrystal fork) SRAM save.
//
// Offsets come from the upstream build's symbol file (ram/sram.asm). Species,
// move and item ids in the party are 8-bit slots into 16-bit conversion
// tables stored in the save; the table contents are mapped to names with the
// upstream constants (see api/saveConstants.ts).

const BANK = 0x2000
const SAVE_VERSION = 2
const CHECK_VALUE_1 = 100 + SAVE_VERSION
const CHECK_VALUE_2 = 200 + SAVE_VERSION

export const MIN_SAVE_SIZE = BANK * 4
export const PARTY_LENGTH = 6
export const NUM_MOVES = 4
export const MAX_EV = 252

const PARTYMON_LENGTH = 48
const MON_SPECIES = 0
const MON_ITEM = 1
const MON_MOVES = 2
const MON_EVS = 11
const MON_ABILITY_SLOT = 17
const ABILITY_SLOT_MASK = 0b11
const MON_PP = 23
const MON_LEVEL = 31
const PARTY_COUNT_SIZE = 8 // wPartyCount, wPartySpecies (6 + terminator)

// Move table: 230 entries; item/species tables: 100 entries.
const TABLE_SIZES = { species: 100, moves: 230, items: 100 } as const
type TableName = keyof typeof TABLE_SIZES

// Each copy of the save: main (bank 1) and backup (bank 0).
interface Copy {
  checkValue1: number
  checkValue2: number
  saveStart: number
  saveEnd: number // also the checksum location
  party: number
  speciesTable: number
  convChecksum: number
  moveTable: number
  itemTable: number
}

const MAIN: Copy = {
  checkValue1: BANK + 0x008,
  checkValue2: BANK + 0xdba,
  saveStart: BANK + 0x009,
  saveEnd: BANK + 0xdb8,
  party: BANK + 0x7cd,
  speciesTable: BANK + 0xcb6,
  convChecksum: BANK + 0xdb6,
  moveTable: 0x60b,
  itemTable: 0xa0b,
}

const BACKUP: Copy = {
  checkValue1: 0xc13,
  checkValue2: 0x19c5,
  saveStart: 0xc14,
  saveEnd: 0x19c3,
  party: 0x13d8,
  speciesTable: 0x18c1,
  convChecksum: 0x19c1,
  moveTable: 0x80b,
  itemTable: 0xb0b,
}

export interface PartyMon {
  species: number // 16-bit species index
  item: number // 16-bit item index, 0 for none
  moves: number[] // 16-bit move indexes, 0 for empty
  level: number
  abilitySlot: number // 0, 1 (ability 1/2) or 2 (hidden)
  evs: number[]
  pp: number[]
}

export interface SaveFile {
  data: Uint8Array
  party: PartyMon[]
}

function sum16(data: Uint8Array, start: number, end: number): number {
  let total = 0
  for (let i = start; i < end; i++) total = (total + data[i]) & 0xffff
  return total
}

const read16 = (d: Uint8Array, at: number) => d[at] | (d[at + 1] << 8)
function write16(d: Uint8Array, at: number, value: number) {
  d[at] = value & 0xff
  d[at + 1] = (value >> 8) & 0xff
}

function tableBase(copy: Copy, table: TableName): number {
  return table === 'species'
    ? copy.speciesTable
    : table === 'moves'
      ? copy.moveTable
      : copy.itemTable
}

// 8-bit id -> 16-bit index. Entry n (1-based) sits at base + 2 + 2 * (n - 1).
function lookup(d: Uint8Array, copy: Copy, table: TableName, id: number) {
  if (id === 0) return 0
  if (id >= 0xff) return 0xff00 | id
  if (id > TABLE_SIZES[table]) return 0
  return read16(d, tableBase(copy, table) + 2 * id)
}

// 16-bit index -> 8-bit id, allocating a table slot when needed.
function resolve(
  d: Uint8Array,
  copy: Copy,
  table: TableName,
  index: number,
): number {
  if (index === 0) return 0
  if (index >= 0xff00) return index & 0xff
  const base = tableBase(copy, table)
  const size = TABLE_SIZES[table]
  let free = 0
  for (let id = 1; id <= size; id++) {
    const value = read16(d, base + 2 * id)
    if (value === index) return id
    if (value === 0 && free === 0) free = id
  }
  if (!free) throw new Error(`The ${table} table in this save is full`)
  write16(d, base + 2 * free, index)
  d[base] += 1 // used slots
  return free
}

function verifyCopy(d: Uint8Array, copy: Copy): boolean {
  return (
    d[copy.checkValue1] === CHECK_VALUE_1 &&
    d[copy.checkValue2] === CHECK_VALUE_2 &&
    sum16(d, copy.saveStart, copy.saveEnd) === read16(d, copy.saveEnd) &&
    sum16(d, copy.moveTable, copy.moveTable + 0x200) ===
      read16(d, copy.convChecksum)
  )
}

function refreshChecksums(d: Uint8Array, copy: Copy) {
  write16(
    d,
    copy.convChecksum,
    sum16(d, copy.moveTable, copy.moveTable + 0x200),
  )
  write16(d, copy.saveEnd, sum16(d, copy.saveStart, copy.saveEnd))
}

function readParty(d: Uint8Array, copy: Copy): PartyMon[] {
  const count = Math.min(d[copy.party], PARTY_LENGTH)
  const party: PartyMon[] = []
  for (let i = 0; i < count; i++) {
    const at = copy.party + PARTY_COUNT_SIZE + i * PARTYMON_LENGTH
    party.push({
      species: lookup(d, copy, 'species', d[copy.party + 1 + i]),
      item: lookup(d, copy, 'items', d[at + MON_ITEM]),
      moves: Array.from({ length: NUM_MOVES }, (_, m) =>
        lookup(d, copy, 'moves', d[at + MON_MOVES + m]),
      ),
      level: d[at + MON_LEVEL],
      // slot value 3 is unused and counts as ability 1
      abilitySlot: (d[at + MON_ABILITY_SLOT] & ABILITY_SLOT_MASK) % 3,
      evs: Array.from(d.slice(at + MON_EVS, at + MON_EVS + 6)),
      pp: Array.from(d.slice(at + MON_PP, at + MON_PP + NUM_MOVES)),
    })
  }
  return party
}

export function parseSave(buffer: ArrayBuffer): SaveFile {
  const data = new Uint8Array(buffer.slice(0))
  if (data.length < MIN_SAVE_SIZE) {
    throw new Error('This file is too small to be a Crystal save (.sav).')
  }
  if (!verifyCopy(data, MAIN)) {
    throw new Error(
      'Save data is invalid or from a different game version (checksum mismatch).',
    )
  }
  return { data, party: readParty(data, MAIN) }
}

// Applies the edited party onto a copy of the save and returns the new bytes.
export function writeSave(save: SaveFile, party: PartyMon[]): Uint8Array {
  const d = new Uint8Array(save.data)
  const hasBackup = verifyCopy(d, BACKUP)
  const copies = hasBackup ? [MAIN, BACKUP] : [MAIN]
  for (const copy of copies) {
    party.forEach((mon, i) => {
      const at = copy.party + PARTY_COUNT_SIZE + i * PARTYMON_LENGTH
      const species = resolve(d, copy, 'species', mon.species)
      d[copy.party + 1 + i] = species
      d[at + MON_SPECIES] = species
      d[at + MON_ITEM] = resolve(d, copy, 'items', mon.item)
      mon.moves.forEach((move, m) => {
        d[at + MON_MOVES + m] = resolve(d, copy, 'moves', move)
        d[at + MON_PP + m] = mon.pp[m]
      })
      d[at + MON_ABILITY_SLOT] =
        (d[at + MON_ABILITY_SLOT] & ~ABILITY_SLOT_MASK) | mon.abilitySlot
      mon.evs.forEach((ev, e) => (d[at + MON_EVS + e] = ev))
    })
    refreshChecksums(d, copy)
  }
  return d
}
