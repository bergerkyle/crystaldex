import { useMemo } from 'react'
import { TrainerTable } from '../components/TrainerTable'
import { RegionAccordion } from '../components/RegionAccordion'
import { compareRegionOrder, formatLocation, regionGroup } from '../pokemon'
import {
  TRAINER_CATEGORY_LABELS,
  TRAINERS_PAGE_CATEGORIES,
  type TrainerListItem,
} from '../trainers'

// Multi-floor gyms are listed as one group.
const FLOOR_SUFFIX_RE = /_B?\d+_?F$/

interface TrainersViewProps {
  trainers: TrainerListItem[]
  loading: boolean
  error: string | null
  filter: string
  onFilterChange: (value: string) => void
  onOpenTrainer: (key: string) => void
}

export function TrainersView({
  trainers,
  loading,
  error,
  filter,
  onFilterChange,
  onOpenTrainer,
}: TrainersViewProps) {
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
        groups: [...byLocation.entries()].map(([key, group]) => ({
          key,
          title:
            group[0].category === 'elite_four' || !group[0].locations[0]
              ? TRAINER_CATEGORY_LABELS[group[0].category]
              : formatLocation(
                  group[0].locations[0].route.replace(FLOOR_SUFFIX_RE, ''),
                ),
          trainers: group,
        })),
      }
    })
  }, [trainers, filter])

  return (
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
        >
          {groups.map((group) => (
            <section className="trainer-group" key={group.key}>
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
  )
}
