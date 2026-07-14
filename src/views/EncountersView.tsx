import {
  formatLocation,
  formatEncounterTime,
  formatName,
  type RouteEncounter,
} from '../pokemon'

interface EncountersViewProps {
  routes: RouteEncounter[]
  loading: boolean
  error: string | null
  allNames: Set<string>
  onSelectPokemon: (name: string) => void
}

function EncounterList({
  entries,
  allNames,
  onSelectPokemon,
}: {
  entries: RouteEncounter['water']
  allNames: Set<string>
  onSelectPokemon: (name: string) => void
}) {
  if (entries.length === 0) return <span className="encounter-empty">-</span>

  return (
    <ul className="encounter-inline-list">
      {entries.map((entry) => (
        <li key={`${entry.pokemon.region}/${entry.pokemon.name}`}>
          <button
            className="move-table-link"
            onClick={() => onSelectPokemon(entry.pokemon.name)}
          >
            {formatName(entry.pokemon.name, entry.pokemon.region, allNames)}
          </button>{' '}
          <span className="encounter-rate">{entry.rate}%</span>
        </li>
      ))}
    </ul>
  )
}

function RouteEncounterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="route-encounter-section">
      <h3 className="route-encounter-section-title">{title}</h3>
      {children}
    </section>
  )
}

export function EncountersView({
  routes,
  loading,
  error,
  allNames,
  onSelectPokemon,
}: EncountersViewProps) {
  return (
    <main className="encounters-page">
      <h1 className="moves-page-title">Wild Encounters</h1>
      <p className="about-description">
        Grass encounter rates use the wild slot probabilities from the ROM
        source for morning, day, and night. Water encounter rates show surfing
        odds.
      </p>
      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <div className="route-encounter-list">
          {routes.map((route) => (
            <details
              key={`${route.region}/${route.route}`}
              className="route-encounter-item"
            >
              <summary className="route-encounter-summary">
                <span className="route-encounter-summary-main">
                  <span className="route-encounter-name">
                    {formatLocation(route.route)}
                  </span>
                  <span className="route-encounter-region">
                    {formatName(route.region)}
                  </span>
                </span>
                <span className="route-encounter-caret" aria-hidden="true">
                  ▾
                </span>
              </summary>
              <div className="route-encounter-body">
                <RouteEncounterSection title="Land">
                  {route.grass.length === 0 ? (
                    <span className="encounter-empty">-</span>
                  ) : (
                    <div className="encounter-time-groups">
                      {route.grass.map((group) => (
                        <div
                          key={`${route.route}-${group.time}`}
                          className="encounter-time-group"
                        >
                          <div className="encounter-time-label">
                            {formatEncounterTime(group.time)}
                          </div>
                          <EncounterList
                            entries={group.encounters}
                            allNames={allNames}
                            onSelectPokemon={onSelectPokemon}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </RouteEncounterSection>

                <RouteEncounterSection title="Water">
                  <EncounterList
                    entries={route.water}
                    allNames={allNames}
                    onSelectPokemon={onSelectPokemon}
                  />
                </RouteEncounterSection>
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  )
}
