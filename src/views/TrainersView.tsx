import { useEffect, useMemo, useState } from 'react'
import { TrainerTable } from '../components/TrainerTable'
import { RegionAccordion } from '../components/RegionAccordion'
import {
  compareRegionOrder,
  formatLocation,
  regionGroup,
  regionGroupLabel,
} from '../pokemon'
import {
  TRAINER_CATEGORY_LABELS,
  TRAINERS_PAGE_CATEGORIES,
  type TrainerListItem,
} from '../trainers'

// Multi-floor gyms are listed as one group.
const FLOOR_SUFFIX_RE = /_B?\d+_?F$/

const GYM_ORDER = [
  'PEWTER_GYM',
  'CERULEAN_GYM',
  'VERMILION_GYM',
  'CELADON_GYM',
  'FUCHSIA_GYM',
  'SAFFRON_GYM',
  'SEAFOAM_GYM',
  'VIRIDIAN_GYM',
  'VIOLET_GYM',
  'AZALEA_GYM',
  'GOLDENROD_GYM',
  'ECRUTEAK_GYM',
  'OLIVINE_GYM',
  'CIANWOOD_GYM',
  'MAHOGANY_GYM',
  'BLACKTHORN_GYM',
  'RUSTBORO_GYM',
  'DEWFORD_GYM',
  'MAUVILLE_GYM',
  'LAVARIDGE_GYM',
  'PETALBURG_GYM',
  'FORTREE_GYM',
  'MOSSDEEP_GYM',
  'SOOTOPOLIS_GYM',
]

const ELITE_FOUR_ORDER = ['will', 'koga', 'bruno', 'karen']
const ELITE_FOUR_CHAMPIONS = ['agatha', 'lance']

function groupRank(category: string, route: string): number {
  if (category === 'elite_four') return 999
  if (category === 'battle_tower') return 1000
  const index = GYM_ORDER.indexOf(route)
  return index === -1 ? 998 : index
}

function eliteRank(trainer: TrainerListItem): number {
  if (trainer.category !== 'elite_four') return 0
  const name = trainer.name.toLowerCase()
  if (ELITE_FOUR_CHAMPIONS.includes(name)) return 1000
  const index =
    trainer.region === 'kanto' ? ELITE_FOUR_ORDER.indexOf(name) : -1
  return index === -1 ? ELITE_FOUR_ORDER.length : index
}

interface TrainersViewProps {
  trainers: TrainerListItem[]
  loading: boolean
  error: string | null
  filter: string
  onFilterChange: (value: string) => void
  onOpenTrainer: (key: string) => void
  mobileSidebarOpen: boolean
  onCloseSidebar: () => void
}

const groupAnchor = (region: string, key: string) =>
  `trainer-group-${region}-${key}`.replace(/[^a-zA-Z0-9_-]/g, '-')

export function TrainersView({
  trainers,
  loading,
  error,
  filter,
  onFilterChange,
  onOpenTrainer,
  mobileSidebarOpen,
  onCloseSidebar,
}: TrainersViewProps) {
  const [closedRegions, setClosedRegions] = useState<Set<string>>(new Set())
  const [openSidebarRegions, setOpenSidebarRegions] = useState<Set<string>>(
    new Set(),
  )
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null)
  const sections = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const listed = trainers.filter((t) =>
      TRAINERS_PAGE_CATEGORIES.includes(t.category),
    )
    const matches = query
      ? listed.filter((trainer) =>
          [
            trainer.name,
            trainer.className,
            trainer.classKey.replace(/_/g, ' '),
            ...trainer.locations.map((l) => formatLocation(l.route)),
          ]
            .join(' ')
            .toLowerCase()
            .includes(query),
        )
      : listed
    const regions = [
      ...new Set(matches.map((t) => regionGroup(t.region))),
    ].sort(compareRegionOrder)
    return regions.map((region) => {
      const inRegion = matches.filter((t) => regionGroup(t.region) === region)
      const byLocation = new Map<string, TrainerListItem[]>()
      for (const category of TRAINERS_PAGE_CATEGORIES) {
        for (const trainer of inRegion.filter((t) => t.category === category)) {
          const route = (trainer.locations[0]?.route ?? '').replace(
            FLOOR_SUFFIX_RE,
            '',
          )
          const key =
            category === 'elite_four' ? 'elite_four' : `${category}/${route}`
          byLocation.set(key, [...(byLocation.get(key) ?? []), trainer])
        }
      }
      return {
        region,
        groups: [...byLocation.entries()]
          .sort(
            ([a, [first]], [b, [second]]) =>
              groupRank(
                first.category,
                (first.locations[0]?.route ?? '').replace(FLOOR_SUFFIX_RE, ''),
              ) -
              groupRank(
                second.category,
                (second.locations[0]?.route ?? '').replace(FLOOR_SUFFIX_RE, ''),
              ),
          )
          .map(([key, group]) => ({
            key,
            title:
              group[0].category === 'elite_four' || !group[0].locations[0]
                ? TRAINER_CATEGORY_LABELS[group[0].category]
                : formatLocation(
                    group[0].locations[0].route.replace(FLOOR_SUFFIX_RE, ''),
                  ),
            trainers: [...group].sort(
              (x, y) =>
                Number(y.className === 'Leader') -
                  Number(x.className === 'Leader') ||
                eliteRank(x) - eliteRank(y),
            ),
          })),
      }
    })
  }, [trainers, filter])

  useEffect(() => {
    if (!pendingAnchor) return
    document
      .getElementById(pendingAnchor)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPendingAnchor(null)
  }, [pendingAnchor])

  const setRegionOpen = (region: string, open: boolean) =>
    setClosedRegions((prev) => {
      const next = new Set(prev)
      if (open) next.delete(region)
      else next.add(region)
      return next
    })

  const toggleSidebarRegion = (region: string) =>
    setOpenSidebarRegions((prev) => {
      const next = new Set(prev)
      if (!next.delete(region)) next.add(region)
      return next
    })

  const goToGroup = (region: string, key: string) => {
    setRegionOpen(region, true)
    setPendingAnchor(groupAnchor(region, key))
    onCloseSidebar()
  }

  return (
    <div className="moves-layout">
      <button
        className={`moves-sidebar-backdrop ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={onCloseSidebar}
        aria-label="Close trainers sidebar"
      />
      <aside
        className={`moves-sidebar ${mobileSidebarOpen ? 'open' : ''}`}
        aria-label="Trainers by region"
      >
        <div className="moves-sidebar-head">
          <span className="moves-sidebar-title">Trainers</span>
          <button
            className="moves-sidebar-close"
            onClick={onCloseSidebar}
            aria-label="Close trainers sidebar"
          >
            <span className="sidebar-close-icon" aria-hidden="true">
              <span className="sidebar-close-line" />
              <span className="sidebar-close-line" />
            </span>
          </button>
        </div>
        <div className="moves-sidebar-scroll">
          {sections.map(({ region, groups }) => {
            const isSidebarOpen =
              filter.trim().length > 0 || openSidebarRegions.has(region)
            return (
              <section className="moves-sidebar-type" key={region}>
                <button
                  className={`moves-sidebar-type-toggle locations-sidebar-region-toggle locations-sidebar-region-toggle-${region}`}
                  onClick={() => toggleSidebarRegion(region)}
                  aria-expanded={isSidebarOpen}
                >
                  <span className="moves-sidebar-type-label">
                    {regionGroupLabel(region)}
                  </span>
                  <span className="moves-sidebar-caret" aria-hidden="true">
                    {isSidebarOpen ? '▾' : '▸'}
                  </span>
                </button>
                {isSidebarOpen && (
                  <ul className="moves-sidebar-move-list">
                    {groups.map((group) => (
                      <li key={group.key}>
                        <button
                          className="moves-sidebar-move-btn"
                          onClick={() => goToGroup(region, group.key)}
                        >
                          {group.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </aside>
      <main className="moves-page trainers-page">
        <h1 className="moves-page-title">Trainers</h1>
        <input
          className="trainer-filter"
          type="search"
          placeholder="Filter by name, class or location"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        />
        {loading && <p className="muted">Loading...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && sections.length === 0 && (
          <p className="muted">No trainers found.</p>
        )}
        {sections.map(({ region, groups }) => (
          <RegionAccordion
            key={region}
            group={region}
            forceOpen={filter.trim().length > 0}
            open={!closedRegions.has(region)}
            onOpenChange={(open) => setRegionOpen(region, open)}
          >
            {groups.map((group) => (
              <section
                className="trainer-group"
                id={groupAnchor(region, group.key)}
                key={group.key}
              >
                <TrainerTable
                  title={group.title}
                  trainers={group.trainers}
                  all={trainers}
                  onOpen={onOpenTrainer}
                />
              </section>
            ))}
          </RegionAccordion>
        ))}
      </main>
    </div>
  )
}
