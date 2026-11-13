import { useMemo } from 'react'
import { TrainerLink } from '../components/TrainerLink'
import { compareRegionOrder, formatLocation, formatName } from '../pokemon'
import {
  TRAINER_CATEGORY_LABELS,
  TRAINERS_PAGE_CATEGORIES,
  type TrainerListItem,
} from '../trainers'

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
    const regions = [...new Set(matches.map((t) => t.region))].sort(
      compareRegionOrder,
    )
    return regions.map((region) => ({
      region,
      categories: TRAINERS_PAGE_CATEGORIES.map((category) => ({
        category,
        trainers: matches.filter(
          (t) => t.region === region && t.category === category,
        ),
      })).filter((group) => group.trainers.length > 0),
    }))
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
      {sections.map(({ region, categories }) => (
        <details className="detail-accordion" key={region} open>
          <summary className="detail-accordion-summary">
            <span className="detail-accordion-title">
              {region ? formatName(region) : 'Other'}
            </span>
            <span className="detail-accordion-caret" aria-hidden="true">
              ▾
            </span>
          </summary>
          <div className="detail-accordion-content">
            {categories.map(({ category, trainers: group }) => (
              <section className="trainer-group" key={category}>
                <h2 className="route-detail-table-title">
                  {TRAINER_CATEGORY_LABELS[category]} ({group.length})
                </h2>
                <div className="trainer-grid">
                  {group.map((trainer) => (
                    <TrainerLink
                      key={trainer.key}
                      trainer={trainer}
                      all={trainers}
                      onOpen={onOpenTrainer}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </details>
      ))}
    </main>
  )
}
