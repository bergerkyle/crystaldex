import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { formatConstant } from '../pokemon'

const BYTES_PER_ROW = 16
const SAVE_CHECK_VALUE_1 = 99
const SAVE_CHECK_VALUE_2 = 127
const NAME_LENGTH = 11
const PARTY_SIZE = 6
const PARTY_HEADER_LENGTH = 8
const PARTYMON_STRUCT_LENGTH = 48

const MON_SPECIES_OFFSET = 0
const MON_MOVES_OFFSET = 2
const MON_LEVEL_OFFSET = 31
const MON_HP_OFFSET = 34
const MON_MAXHP_OFFSET = 36
const MON_ATK_OFFSET = 38
const MON_DEF_OFFSET = 40
const MON_SPD_OFFSET = 42
const MON_SAT_OFFSET = 44
const MON_SDF_OFFSET = 46

const MON_TABLE_ENTRIES = 100
const MON_TABLE_MIN_RESERVED_INDEX = 0xfd
const MON_TABLE_SAVED_RECENT_INDEXES = 8
const MON_TABLE_TOTAL_BYTES = 256

const MOVE_TABLE_ENTRIES = 230
const MOVE_TABLE_MIN_RESERVED_INDEX = 0xff
const MOVE_TABLE_SAVED_RECENT_INDEXES = 16
const MOVE_TABLE_TOTAL_BYTES = 512

interface SaveBlock {
  checkValue1Offset: number
  saveDataStart: number
  checksumOffset: number
  checkValue2Offset: number
}

interface StructuredPointers {
  nameOffset: number
  partyOffset: number | null
}

interface SaveLookups {
  speciesById: string[]
  moveKeysById: string[]
}

interface PartyMove {
  slot: number
  id: number
  index: number
  key: string
  name: string
}

interface PartyPokemon {
  slot: number
  speciesId: number
  speciesIndex: number
  speciesKey: string
  species: string
  level: number
  moves: PartyMove[]
  hp: number
  maxHp: number
  attack: number
  defense: number
  speed: number
  specialAttack: number
  specialDefense: number
}

function toHex(value: number, width = 2): string {
  return value.toString(16).toUpperCase().padStart(width, '0')
}

function toPrintableAscii(value: number): string {
  if (value >= 32 && value <= 126) return String.fromCharCode(value)
  return '.'
}

function sumRange(
  bytes: Uint8Array,
  start: number,
  endExclusive: number,
): number {
  let lo = 0
  let hi = 0
  for (let i = start; i < endExclusive; i++) {
    lo += bytes[i]
    if (lo > 0xff) {
      lo &= 0xff
      hi = (hi + 1) & 0xff
    }
  }
  return lo | (hi << 8)
}

function writeSaveChecksum(bytes: Uint8Array, block: SaveBlock): void {
  const checksum = sumRange(bytes, block.saveDataStart, block.checksumOffset)
  bytes[block.checksumOffset] = checksum & 0xff
  bytes[block.checksumOffset + 1] = (checksum >> 8) & 0xff
}

function findSaveBlocks(bytes: Uint8Array): SaveBlock[] {
  const check2Offsets: number[] = []
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i + 2] === SAVE_CHECK_VALUE_2) check2Offsets.push(i)
  }

  const results: SaveBlock[] = []
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] !== SAVE_CHECK_VALUE_1) continue
    for (const checksumOffset of check2Offsets) {
      if (checksumOffset <= i + 16) continue
      const computed = sumRange(bytes, i + 1, checksumOffset)
      const stored = bytes[checksumOffset] | (bytes[checksumOffset + 1] << 8)
      if (computed !== stored) continue
      results.push({
        checkValue1Offset: i,
        saveDataStart: i + 1,
        checksumOffset,
        checkValue2Offset: checksumOffset + 2,
      })
      break
    }
  }

  return results.sort((a, b) => a.saveDataStart - b.saveDataStart)
}

function decodeGameChar(value: number): string {
  if (value >= 0x80 && value <= 0x99)
    return String.fromCharCode(65 + value - 0x80)
  if (value >= 0xa0 && value <= 0xb9)
    return String.fromCharCode(97 + value - 0xa0)
  if (value >= 0xf6 && value <= 0xff)
    return String.fromCharCode(48 + value - 0xf6)
  if (value === 0x7f) return ' '
  if (value === 0xe3) return '-'
  if (value === 0xe8) return '.'
  return ''
}

function encodeGameChar(value: string): number {
  if (value >= 'A' && value <= 'Z') return 0x80 + (value.charCodeAt(0) - 65)
  if (value >= 'a' && value <= 'z') return 0xa0 + (value.charCodeAt(0) - 97)
  if (value >= '0' && value <= '9') return 0xf6 + (value.charCodeAt(0) - 48)
  if (value === ' ') return 0x7f
  if (value === '-') return 0xe3
  if (value === '.') return 0xe8
  return 0x7f
}

function decodeName(bytes: Uint8Array, offset: number): string {
  let out = ''
  for (let i = 0; i < NAME_LENGTH; i++) {
    const value = bytes[offset + i]
    if (value === 0x50) break
    out += decodeGameChar(value)
  }
  return out.trim()
}

function encodeName(bytes: Uint8Array, offset: number, value: string): void {
  const trimmed = value.slice(0, NAME_LENGTH)
  for (let i = 0; i < NAME_LENGTH; i++) {
    bytes[offset + i] = i < trimmed.length ? encodeGameChar(trimmed[i]) : 0x50
  }
}

function findPartyOffset(saveData: Uint8Array): number | null {
  let bestOffset: number | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (let i = 0; i < saveData.length - PARTY_HEADER_LENGTH; i++) {
    const count = saveData[i]
    if (count < 1 || count > PARTY_SIZE) continue
    if (saveData[i + 7] !== 0xff) continue

    let score = 0
    const monDataStart = i + PARTY_HEADER_LENGTH
    if (monDataStart + count * PARTYMON_STRUCT_LENGTH > saveData.length) {
      continue
    }

    for (let slot = 0; slot < PARTY_SIZE; slot++) {
      const species = saveData[i + 1 + slot]
      if (slot < count) {
        if (species >= 1 && species < MON_TABLE_MIN_RESERVED_INDEX) score += 2
        else score -= 5
      } else if (species === 0 || species === 0xff) {
        score += 1
      }
    }

    for (let slot = 0; slot < count; slot++) {
      const base = monDataStart + slot * PARTYMON_STRUCT_LENGTH
      const headerSpecies = saveData[i + 1 + slot]
      const structSpecies = saveData[base + MON_SPECIES_OFFSET]
      if (headerSpecies === structSpecies) score += 4
      else score -= 6

      const level = saveData[base + MON_LEVEL_OFFSET]
      if (level >= 1 && level <= 100) score += 2
      else score -= 4

      const hp = readUint16BE(saveData, base + MON_HP_OFFSET)
      const maxHp = readUint16BE(saveData, base + MON_MAXHP_OFFSET)
      if (maxHp > 0 && hp <= maxHp) score += 2
      else score -= 3

      const moves = [
        saveData[base + MON_MOVES_OFFSET],
        saveData[base + MON_MOVES_OFFSET + 1],
        saveData[base + MON_MOVES_OFFSET + 2],
        saveData[base + MON_MOVES_OFFSET + 3],
      ]
      const nonZeroMoves = moves.filter((move) => move !== 0).length
      if (nonZeroMoves >= 1 && nonZeroMoves <= 4) score += 1
    }

    if (score > bestScore) {
      bestScore = score
      bestOffset = i
    }
  }

  return bestScore >= 26 ? bestOffset : null
}

function parseHexOffset(raw: string): number | null {
  const trimmed = raw.trim().replace(/^0x/i, '')
  if (!trimmed) return 0
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) return null
  return Number.parseInt(trimmed, 16)
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function writeUint16BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >> 8) & 0xff
  bytes[offset + 1] = value & 0xff
}

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >> 8) & 0xff
}

function normalizeConstantInput(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
}

function findLookupIndex(lookup: string[], raw: string): number {
  const normalized = normalizeConstantInput(raw)
  if (!normalized) return -1
  return lookup.findIndex((value) => value === normalized)
}

function displayConstant(value: string): string {
  return value.includes('_') ? `${value} (${formatConstant(value)})` : value
}

function decodeConvertedId(
  saveData: Uint8Array,
  tableOffset: number | null,
  id: number,
  entries: number,
  minimumReservedIndex: number,
): number {
  if (id === 0) return 0
  if (id >= minimumReservedIndex) return 0xff00 | id
  if (id > entries) return 0
  if (tableOffset == null) return id

  const entryOffset = tableOffset + 2 + (id - 1) * 2
  if (entryOffset + 1 >= saveData.length) return 0
  return readUint16LE(saveData, entryOffset)
}

function encodeConvertedId(
  saveData: Uint8Array,
  tableOffset: number | null,
  index: number,
  entries: number,
  minimumReservedIndex: number,
): number | null {
  if (index <= 0) return null
  if (tableOffset == null) {
    return index <= entries ? index : null
  }

  for (let id = 1; id <= entries; id++) {
    const mapped = decodeConvertedId(
      saveData,
      tableOffset,
      id,
      entries,
      minimumReservedIndex,
    )
    if (mapped === index) return id
  }

  return null
}

function allocateConvertedId(
  saveData: Uint8Array,
  tableOffset: number,
  index: number,
  entries: number,
): number | null {
  if (index <= 0) return null

  for (let id = 1; id <= entries; id++) {
    const entryOffset = tableOffset + 2 + (id - 1) * 2
    if (entryOffset + 1 >= saveData.length) break
    const value = readUint16LE(saveData, entryOffset)
    if (value === index) return id
  }

  for (let id = 1; id <= entries; id++) {
    const entryOffset = tableOffset + 2 + (id - 1) * 2
    if (entryOffset + 1 >= saveData.length) break
    const value = readUint16LE(saveData, entryOffset)
    if (value !== 0) continue

    writeUint16LE(saveData, entryOffset, index)
    saveData[tableOffset] = Math.min(entries, saveData[tableOffset] + 1)
    return id
  }

  return null
}

function isLikelyConversionTable(
  saveData: Uint8Array,
  offset: number,
  entries: number,
  maxLastAllocatedIndex: number,
  maxValue: number,
): boolean {
  if (offset + 2 + entries * 2 > saveData.length) return false
  const usedSlots = saveData[offset]
  const lastAllocatedIndex = saveData[offset + 1]
  if (usedSlots > entries) return false
  if (lastAllocatedIndex > maxLastAllocatedIndex) return false

  let nonZero = 0
  let plausible = 0
  for (let i = 0; i < entries; i++) {
    const value = readUint16LE(saveData, offset + 2 + i * 2)
    if (value === 0) continue
    nonZero += 1
    if (value <= maxValue || value >= 0xff00) plausible += 1
  }

  if (nonZero === 0) return false
  if (nonZero + 6 < usedSlots) return false
  return plausible * 100 >= nonZero * 90
}

function findConversionTableOffset(
  bytes: Uint8Array,
  entries: number,
  totalBytes: number,
  maxLastAllocatedIndex: number,
  maxValue: number,
  minOffset: number,
  maxOffset: number,
  sampledIds: number[] = [],
  startHint?: number,
): number | null {
  const boundedMin = Math.max(0, minOffset)
  const boundedMax = Math.min(maxOffset, bytes.length - totalBytes)
  if (boundedMin > boundedMax) return null

  let bestOffset: number | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  const scoreCandidate = (offset: number): number => {
    const usedSlots = bytes[offset]
    if (usedSlots === 0) return Number.NEGATIVE_INFINITY

    let score = Math.min(usedSlots, sampledIds.length)
    let remappedCount = 0
    for (const id of sampledIds) {
      const mapped = decodeConvertedId(
        bytes,
        offset,
        id,
        entries,
        entries === MOVE_TABLE_ENTRIES
          ? MOVE_TABLE_MIN_RESERVED_INDEX
          : MON_TABLE_MIN_RESERVED_INDEX,
      )
      if (mapped >= 1 && mapped <= maxValue) score += 2
      else score -= 5
      if (mapped !== id && mapped !== 0) remappedCount += 1
    }

    score += remappedCount * 2
    return score
  }

  if (startHint != null && startHint >= boundedMin && startHint <= boundedMax) {
    if (
      isLikelyConversionTable(
        bytes,
        startHint,
        entries,
        maxLastAllocatedIndex,
        maxValue,
      )
    ) {
      const score = scoreCandidate(startHint)
      if (score > bestScore) {
        bestScore = score
        bestOffset = startHint
      }
    }
  }

  for (let offset = boundedMin; offset <= boundedMax; offset++) {
    if (
      isLikelyConversionTable(
        bytes,
        offset,
        entries,
        maxLastAllocatedIndex,
        maxValue,
      )
    ) {
      const score = scoreCandidate(offset)
      if (score > bestScore) {
        bestScore = score
        bestOffset = offset
      }
    }
  }

  return bestOffset
}

function findPokemonTableOffset(
  saveData: Uint8Array,
  maxSpeciesIndex: number,
  partyIds: number[],
  minOffset: number,
): number | null {
  let bestOffset: number | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (
    let offset = Math.max(0, minOffset);
    offset <= saveData.length - MON_TABLE_TOTAL_BYTES;
    offset++
  ) {
    if (
      !isLikelyConversionTable(
        saveData,
        offset,
        MON_TABLE_ENTRIES,
        MON_TABLE_SAVED_RECENT_INDEXES - 1,
        maxSpeciesIndex,
      )
    ) {
      continue
    }

    const usedSlots = saveData[offset]
    if (usedSlots === 0) continue

    let score = 0
    let remappedCount = 0
    for (const id of partyIds) {
      const index = decodeConvertedId(
        saveData,
        offset,
        id,
        MON_TABLE_ENTRIES,
        MON_TABLE_MIN_RESERVED_INDEX,
      )
      if (index >= 1 && index <= maxSpeciesIndex) score += 4
      else score -= 6
      if (index !== id && index !== 0) remappedCount += 1
    }

    score += remappedCount * 3
    score += Math.min(usedSlots, partyIds.length)

    if (score > bestScore) {
      bestScore = score
      bestOffset = offset
    }
  }

  return bestOffset
}

export function SaveView() {
  const [fileName, setFileName] = useState<string>('')
  const [saveBytes, setSaveBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lookups, setLookups] = useState<SaveLookups | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/save/lookups')
      .then((res) => {
        if (!res.ok)
          throw new Error(`Failed to load save lookups (${res.status})`)
        return res.json() as Promise<SaveLookups>
      })
      .then(setLookups)
      .catch((err: unknown) => {
        setLookupError(err instanceof Error ? err.message : 'Unknown error')
      })
  }, [])

  const saveBlocks = useMemo(
    () => (saveBytes ? findSaveBlocks(saveBytes) : []),
    [saveBytes],
  )
  const activeSaveBlock = saveBlocks[saveBlocks.length - 1] ?? null

  const structuredPointers = useMemo<StructuredPointers | null>(() => {
    if (!saveBytes || !activeSaveBlock) return null
    const saveData = saveBytes.subarray(
      activeSaveBlock.saveDataStart,
      activeSaveBlock.checksumOffset,
    )
    const partyOffset = findPartyOffset(saveData)
    return {
      nameOffset: activeSaveBlock.saveDataStart + 2,
      partyOffset,
    }
  }, [saveBytes, activeSaveBlock, lookups])

  const decodedName = useMemo(() => {
    if (!saveBytes || !structuredPointers) return ''
    return decodeName(saveBytes, structuredPointers.nameOffset)
  }, [saveBytes, structuredPointers])

  const decodedParty = useMemo(() => {
    if (
      !saveBytes ||
      structuredPointers?.partyOffset == null ||
      !activeSaveBlock
    ) {
      return null
    }

    const base = activeSaveBlock.saveDataStart + structuredPointers.partyOffset
    const count = Math.min(saveBytes[base], PARTY_SIZE)
    const monDataStart = base + PARTY_HEADER_LENGTH
    const maxSpeciesIndex = Math.max(
      (lookups?.speciesById.length ?? 1) - 1,
      251,
    )
    const maxMoveIndex = Math.max((lookups?.moveKeysById.length ?? 1) - 1, 255)
    const partyIds = Array.from(
      { length: count },
      (_, slot) => saveBytes[base + 1 + slot],
    )
    const partyMoveIds = Array.from({ length: count * 4 }, (_, idx) => {
      const slot = Math.floor(idx / 4)
      const move = idx % 4
      const structBase = monDataStart + slot * PARTYMON_STRUCT_LENGTH
      if (structBase + PARTYMON_STRUCT_LENGTH > saveBytes.length) return 0
      return saveBytes[structBase + MON_MOVES_OFFSET + move]
    }).filter((value) => value !== 0)
    const saveData = saveBytes.subarray(
      activeSaveBlock.saveDataStart,
      activeSaveBlock.checksumOffset,
    )
    const pokemonTableOffset = findPokemonTableOffset(
      saveData,
      maxSpeciesIndex,
      partyIds,
      structuredPointers.partyOffset +
        PARTY_HEADER_LENGTH +
        PARTY_SIZE * PARTYMON_STRUCT_LENGTH,
    )

    const moveTableStartHint =
      activeSaveBlock.saveDataStart > MOVE_TABLE_TOTAL_BYTES
        ? activeSaveBlock.saveDataStart - MOVE_TABLE_TOTAL_BYTES
        : 0
    const moveTableOffset = findConversionTableOffset(
      saveBytes,
      MOVE_TABLE_ENTRIES,
      MOVE_TABLE_TOTAL_BYTES,
      MOVE_TABLE_SAVED_RECENT_INDEXES - 1,
      maxMoveIndex,
      0,
      activeSaveBlock.checksumOffset,
      partyMoveIds,
      moveTableStartHint,
    )
    const party: PartyPokemon[] = []

    for (let index = 0; index < count; index++) {
      const structBase = monDataStart + index * PARTYMON_STRUCT_LENGTH
      if (structBase + PARTYMON_STRUCT_LENGTH > saveBytes.length) break

      const headerSpecies = saveBytes[base + 1 + index]
      const structSpecies = saveBytes[structBase + MON_SPECIES_OFFSET]
      const speciesId = headerSpecies || structSpecies
      const speciesIndex = decodeConvertedId(
        saveData,
        pokemonTableOffset,
        speciesId,
        MON_TABLE_ENTRIES,
        MON_TABLE_MIN_RESERVED_INDEX,
      )
      const speciesConstant =
        lookups?.speciesById[speciesIndex] &&
        lookups.speciesById[speciesIndex].length > 0
          ? lookups.speciesById[speciesIndex]
          : `UNKNOWN_${speciesIndex || speciesId}`

      const moves: PartyMove[] = []
      for (let moveIndex = 0; moveIndex < 4; moveIndex++) {
        const moveId = saveBytes[structBase + MON_MOVES_OFFSET + moveIndex]
        const moveIndexValue =
          moveId === 0
            ? 0
            : decodeConvertedId(
                saveBytes,
                moveTableOffset,
                moveId,
                MOVE_TABLE_ENTRIES,
                MOVE_TABLE_MIN_RESERVED_INDEX,
              )
        const moveKey =
          moveId === 0 ? '' : (lookups?.moveKeysById[moveIndexValue] ?? '')
        moves.push({
          slot: moveIndex + 1,
          id: moveId,
          index: moveIndexValue,
          key: moveKey,
          name:
            moveId === 0
              ? 'None'
              : moveKey
                ? displayConstant(moveKey)
                : `Unknown Move ${moveIndexValue || moveId}`,
        })
      }

      party.push({
        slot: index + 1,
        speciesId,
        speciesIndex,
        speciesKey: speciesConstant,
        species: displayConstant(speciesConstant),
        level: saveBytes[structBase + MON_LEVEL_OFFSET],
        moves,
        hp: readUint16BE(saveBytes, structBase + MON_HP_OFFSET),
        maxHp: readUint16BE(saveBytes, structBase + MON_MAXHP_OFFSET),
        attack: readUint16BE(saveBytes, structBase + MON_ATK_OFFSET),
        defense: readUint16BE(saveBytes, structBase + MON_DEF_OFFSET),
        speed: readUint16BE(saveBytes, structBase + MON_SPD_OFFSET),
        specialAttack: readUint16BE(saveBytes, structBase + MON_SAT_OFFSET),
        specialDefense: readUint16BE(saveBytes, structBase + MON_SDF_OFFSET),
      })
    }

    return {
      count,
      party,
      partyOffset: structuredPointers.partyOffset,
      pokemonTableOffset,
      moveTableOffset,
      sampledMoveIds: partyMoveIds.length,
    }
  }, [saveBytes, structuredPointers, activeSaveBlock, lookups])

  const onUploadFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      setFileName(file.name)
      setSaveBytes(bytes)
      setError(null)
      setEditError(null)
    } catch {
      setError('Could not read this file.')
    }
  }

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    void onUploadFile(file)
  }

  const updateStructured = (updater: (next: Uint8Array) => void) => {
    if (!saveBytes) return
    const next = new Uint8Array(saveBytes)
    updater(next)
    if (saveBlocks.length > 0) {
      for (const block of saveBlocks) {
        writeSaveChecksum(next, block)
      }
    } else if (activeSaveBlock) {
      writeSaveChecksum(next, activeSaveBlock)
    }
    setSaveBytes(next)
  }

  const updatePartyField16 = (
    slot: number,
    fieldOffset: number,
    raw: string,
  ) => {
    if (!activeSaveBlock || structuredPointers?.partyOffset == null) return
    const trimmed = raw.trim()
    if (!/^\d+$/.test(trimmed)) return

    const value = Number.parseInt(trimmed, 10)
    if (Number.isNaN(value)) return
    const clamped = Math.max(0, Math.min(value, 0xffff))

    updateStructured((next) => {
      const structBase =
        activeSaveBlock.saveDataStart +
        structuredPointers.partyOffset! +
        PARTY_HEADER_LENGTH +
        (slot - 1) * PARTYMON_STRUCT_LENGTH
      if (structBase + PARTYMON_STRUCT_LENGTH > next.length) return
      writeUint16BE(next, structBase + fieldOffset, clamped)
    })
  }

  const updatePartyLevel = (slot: number, raw: string) => {
    if (!activeSaveBlock || structuredPointers?.partyOffset == null) return
    const trimmed = raw.trim()
    if (!/^\d+$/.test(trimmed)) return

    const value = Number.parseInt(trimmed, 10)
    if (Number.isNaN(value)) return
    const clamped = Math.max(1, Math.min(value, 100))

    updateStructured((next) => {
      const structBase =
        activeSaveBlock.saveDataStart +
        structuredPointers.partyOffset! +
        PARTY_HEADER_LENGTH +
        (slot - 1) * PARTYMON_STRUCT_LENGTH
      if (structBase + PARTYMON_STRUCT_LENGTH > next.length) return
      next[structBase + MON_LEVEL_OFFSET] = clamped
    })
  }

  const updatePartySpecies = (slot: number, raw: string) => {
    if (
      !activeSaveBlock ||
      structuredPointers?.partyOffset == null ||
      !decodedParty ||
      !lookups
    ) {
      return
    }

    const speciesIndex = findLookupIndex(lookups.speciesById, raw)
    if (speciesIndex < 1) {
      setEditError(
        `Unknown species constant: ${normalizeConstantInput(raw) || raw.trim()}`,
      )
      return
    }

    let wrote = false

    updateStructured((next) => {
      const tableOffsetRel = decodedParty.pokemonTableOffset
      if (tableOffsetRel == null) return

      for (let blockIndex = 0; blockIndex < saveBlocks.length; blockIndex++) {
        const block = saveBlocks[blockIndex]
        const tableOffsetAbs = block.saveDataStart + tableOffsetRel
        if (
          tableOffsetAbs < 0 ||
          tableOffsetAbs + MON_TABLE_TOTAL_BYTES > next.length
        ) {
          continue
        }
        if (
          !isLikelyConversionTable(
            next,
            tableOffsetAbs,
            MON_TABLE_ENTRIES,
            MON_TABLE_SAVED_RECENT_INDEXES - 1,
            Math.max((lookups.speciesById.length ?? 1) - 1, 251),
          )
        ) {
          continue
        }

        const saveData = next.subarray(
          block.saveDataStart,
          block.checksumOffset,
        )

        let speciesId = encodeConvertedId(
          saveData,
          tableOffsetRel,
          speciesIndex,
          MON_TABLE_ENTRIES,
          MON_TABLE_MIN_RESERVED_INDEX,
        )

        if (speciesId == null) {
          speciesId = allocateConvertedId(
            next,
            tableOffsetAbs,
            speciesIndex,
            MON_TABLE_ENTRIES,
          )
        }

        if (speciesId == null || speciesId < 1 || speciesId > 0xff) continue

        const structBase =
          block.saveDataStart +
          structuredPointers.partyOffset! +
          PARTY_HEADER_LENGTH +
          (slot - 1) * PARTYMON_STRUCT_LENGTH
        if (structBase + PARTYMON_STRUCT_LENGTH > next.length) continue

        const headerOffset =
          block.saveDataStart + structuredPointers.partyOffset! + slot
        next[headerOffset] = speciesId
        next[structBase + MON_SPECIES_OFFSET] = speciesId
        wrote = true
      }
    })

    if (wrote) setEditError(null)
    else {
      const key = normalizeConstantInput(raw) || raw.trim()
      setEditError(`Could not map species ${key} into this save's ID table.`)
    }
  }

  const updatePartyMove = (slot: number, moveSlot: number, raw: string) => {
    if (
      !activeSaveBlock ||
      structuredPointers?.partyOffset == null ||
      !decodedParty ||
      !lookups
    ) {
      return
    }

    const trimmed = raw.trim()
    const moveIndex = trimmed ? findLookupIndex(lookups.moveKeysById, raw) : 0
    if (trimmed && moveIndex < 1) {
      setEditError(
        `Unknown move constant: ${normalizeConstantInput(raw) || trimmed}`,
      )
      return
    }

    let wrote = false

    updateStructured((next) => {
      const moveTableOffsets: number[] = []
      const pushTableOffset = (offset: number | null) => {
        if (offset == null) return
        if (offset < 0 || offset + MOVE_TABLE_TOTAL_BYTES > next.length) return
        if (
          !isLikelyConversionTable(
            next,
            offset,
            MOVE_TABLE_ENTRIES,
            MOVE_TABLE_SAVED_RECENT_INDEXES - 1,
            Math.max((lookups.moveKeysById.length ?? 1) - 1, 255),
          )
        ) {
          return
        }
        if (!moveTableOffsets.includes(offset)) moveTableOffsets.push(offset)
      }

      pushTableOffset(decodedParty.moveTableOffset)
      pushTableOffset(
        decodedParty.moveTableOffset == null
          ? null
          : decodedParty.moveTableOffset - MOVE_TABLE_TOTAL_BYTES,
      )
      pushTableOffset(
        decodedParty.moveTableOffset == null
          ? null
          : decodedParty.moveTableOffset + MOVE_TABLE_TOTAL_BYTES,
      )

      moveTableOffsets.sort((a, b) => a - b)

      for (let blockIndex = 0; blockIndex < saveBlocks.length; blockIndex++) {
        const block = saveBlocks[blockIndex]
        const tableOffset =
          moveTableOffsets[
            Math.min(blockIndex, Math.max(moveTableOffsets.length - 1, 0))
          ] ?? decodedParty.moveTableOffset

        let moveId =
          moveIndex === 0
            ? 0
            : encodeConvertedId(
                next,
                tableOffset,
                moveIndex,
                MOVE_TABLE_ENTRIES,
                MOVE_TABLE_MIN_RESERVED_INDEX,
              )

        if (moveId == null && moveIndex > 0 && tableOffset != null) {
          moveId = allocateConvertedId(
            next,
            tableOffset,
            moveIndex,
            MOVE_TABLE_ENTRIES,
          )
        }

        if (moveId == null || moveId < 0 || moveId > 0xff) continue

        const structBase =
          block.saveDataStart +
          structuredPointers.partyOffset! +
          PARTY_HEADER_LENGTH +
          (slot - 1) * PARTYMON_STRUCT_LENGTH
        if (structBase + PARTYMON_STRUCT_LENGTH > next.length) continue

        next[structBase + MON_MOVES_OFFSET + moveSlot] = moveId

        if (
          tableOffset != null &&
          block.checksumOffset - 2 >= 0 &&
          tableOffset + MOVE_TABLE_TOTAL_BYTES <= next.length
        ) {
          const tableChecksum = sumRange(
            next,
            tableOffset,
            tableOffset + MOVE_TABLE_TOTAL_BYTES,
          )
          writeUint16LE(next, block.checksumOffset - 2, tableChecksum)
        }

        wrote = true
      }
    })

    if (wrote) setEditError(null)
    else {
      const key = normalizeConstantInput(raw) || trimmed || '(empty)'
      setEditError(`Could not map move ${key} into this save's ID table.`)
    }
  }

  const downloadEditedSave = () => {
    if (!saveBytes) return
    const blob = new Blob(
      [
        saveBytes.buffer.slice(
          saveBytes.byteOffset,
          saveBytes.byteOffset + saveBytes.byteLength,
        ) as ArrayBuffer,
      ],
      { type: 'application/octet-stream' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const finalName = fileName.toLowerCase().endsWith('.sav')
      ? fileName
      : `${fileName || 'edited'}.sav`
    link.href = url
    link.download = finalName
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="save-page">
      <div className="save-content">
        <h1 className="save-title">Save Editor</h1>
        <p className="save-description">
          Load a .sav file, inspect structured values, and export an updated
          save.
        </p>

        <section className="save-panel">
          <div className="save-controls">
            <div className="save-control-group">
              <label className="save-upload-label" htmlFor="save-upload-input">
                Select .sav file
              </label>
              <input
                id="save-upload-input"
                className="save-upload-input"
                type="file"
                accept=".sav,application/octet-stream"
                onChange={onPickFile}
              />
            </div>
            <div className="save-button-row">
              <button
                className="save-btn primary"
                onClick={downloadEditedSave}
                disabled={!saveBytes}
              >
                Download edited .sav
              </button>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          {lookupError && <p className="error">{lookupError}</p>}
          {editError && <p className="error">{editError}</p>}
          {saveBytes && (
            <div className="save-meta-grid">
              <div className="save-meta-item">
                <span className="save-meta-key">File</span>
                <span className="save-meta-value">{fileName || 'Unknown'}</span>
              </div>
              <div className="save-meta-item">
                <span className="save-meta-key">Size</span>
                <span className="save-meta-value">
                  {saveBytes.length} bytes
                </span>
              </div>
            </div>
          )}
        </section>

        {saveBytes && (
          <>
            {activeSaveBlock && structuredPointers && (
              <section className="save-panel">
                <h2 className="save-panel-title">
                  CrystalShire Decoded Fields
                </h2>
                <div className="save-controls">
                  <div className="save-control-group">
                    <label htmlFor="save-player-name">Player name</label>
                    <input
                      id="save-player-name"
                      className="search"
                      value={decodedName}
                      onChange={(event) => {
                        updateStructured((next) => {
                          encodeName(
                            next,
                            structuredPointers.nameOffset,
                            event.target.value,
                          )
                        })
                      }}
                    />
                  </div>
                </div>

                {decodedParty && (
                  <>
                    <div className="save-party-table-wrap">
                      {lookups && (
                        <>
                          <datalist id="save-species-options">
                            {lookups.speciesById
                              .map((key, idx) => ({ key, idx }))
                              .filter((entry) => entry.idx > 0 && entry.key)
                              .map((entry) => (
                                <option
                                  key={`species-${entry.idx}`}
                                  value={entry.key}
                                />
                              ))}
                          </datalist>
                          <datalist id="save-move-options">
                            {lookups.moveKeysById
                              .map((key, idx) => ({ key, idx }))
                              .filter((entry) => entry.idx > 0 && entry.key)
                              .map((entry) => (
                                <option
                                  key={`move-${entry.idx}`}
                                  value={entry.key}
                                />
                              ))}
                          </datalist>
                        </>
                      )}
                      <table className="save-party-table">
                        <thead>
                          <tr>
                            <th>Slot</th>
                            <th>Species</th>
                            <th>Level</th>
                            <th>Moves</th>
                            <th>Stats</th>
                          </tr>
                        </thead>
                        <tbody>
                          {decodedParty.party.map((member) => (
                            <tr key={member.slot}>
                              <td className="save-party-cell-sm">
                                {member.slot}
                              </td>
                              <td>
                                <input
                                  key={`species-input-${member.slot}-${member.speciesId}`}
                                  className="search"
                                  list="save-species-options"
                                  defaultValue={member.speciesKey}
                                  onBlur={(event) =>
                                    updatePartySpecies(
                                      member.slot,
                                      event.target.value,
                                    )
                                  }
                                />
                                <div className="save-party-subtext">
                                  ID {member.speciesId} - Index{' '}
                                  {member.speciesIndex}
                                </div>
                              </td>
                              <td className="save-party-cell-sm">
                                <input
                                  className="search"
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={member.level}
                                  onChange={(event) =>
                                    updatePartyLevel(
                                      member.slot,
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                {member.moves.map((move, moveSlot) => (
                                  <div key={`${member.slot}-move-${move.slot}`}>
                                    <input
                                      key={`move-input-${member.slot}-${move.slot}-${move.id}`}
                                      className="search"
                                      list="save-move-options"
                                      defaultValue={move.key}
                                      placeholder="(empty)"
                                      onBlur={(event) =>
                                        updatePartyMove(
                                          member.slot,
                                          moveSlot,
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <span className="save-party-subtext-inline">
                                      {' '}
                                      (ID {move.id} - Index {move.index})
                                    </span>
                                  </div>
                                ))}
                              </td>
                              <td>
                                <div>
                                  HP{' '}
                                  <input
                                    className="search"
                                    type="number"
                                    min={0}
                                    max={65535}
                                    value={member.hp}
                                    onChange={(event) =>
                                      updatePartyField16(
                                        member.slot,
                                        MON_HP_OFFSET,
                                        event.target.value,
                                      )
                                    }
                                  />
                                  {' / '}
                                  <input
                                    className="search"
                                    type="number"
                                    min={0}
                                    max={65535}
                                    value={member.maxHp}
                                    onChange={(event) =>
                                      updatePartyField16(
                                        member.slot,
                                        MON_MAXHP_OFFSET,
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
                                <div>
                                  Atk{' '}
                                  <input
                                    className="search"
                                    type="number"
                                    min={0}
                                    max={65535}
                                    value={member.attack}
                                    onChange={(event) =>
                                      updatePartyField16(
                                        member.slot,
                                        MON_ATK_OFFSET,
                                        event.target.value,
                                      )
                                    }
                                  />
                                  {' | '}Def{' '}
                                  <input
                                    className="search"
                                    type="number"
                                    min={0}
                                    max={65535}
                                    value={member.defense}
                                    onChange={(event) =>
                                      updatePartyField16(
                                        member.slot,
                                        MON_DEF_OFFSET,
                                        event.target.value,
                                      )
                                    }
                                  />
                                  {' | '}Spd{' '}
                                  <input
                                    className="search"
                                    type="number"
                                    min={0}
                                    max={65535}
                                    value={member.speed}
                                    onChange={(event) =>
                                      updatePartyField16(
                                        member.slot,
                                        MON_SPD_OFFSET,
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
                                <div>
                                  SpA{' '}
                                  <input
                                    className="search"
                                    type="number"
                                    min={0}
                                    max={65535}
                                    value={member.specialAttack}
                                    onChange={(event) =>
                                      updatePartyField16(
                                        member.slot,
                                        MON_SAT_OFFSET,
                                        event.target.value,
                                      )
                                    }
                                  />
                                  {' | '}SpD{' '}
                                  <input
                                    className="search"
                                    type="number"
                                    min={0}
                                    max={65535}
                                    value={member.specialDefense}
                                    onChange={(event) =>
                                      updatePartyField16(
                                        member.slot,
                                        MON_SDF_OFFSET,
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
