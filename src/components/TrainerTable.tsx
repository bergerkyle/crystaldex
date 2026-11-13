import { formatLocation } from '../pokemon'
import { trainerLabel, type TrainerListItem } from '../trainers'

interface TrainerTableProps {
  trainers: TrainerListItem[]
  all: TrainerListItem[]
  showLocation?: boolean
  onOpen: (key: string) => void
}

// The sprite sheet stacks 16px frames vertically; the first is front-facing.
function TrainerSprite({ trainer }: { trainer: TrainerListItem }) {
  if (!trainer.spriteUrl) {
    return trainer.picUrl ? (
      <img className="trainer-table-pic" src={trainer.picUrl} alt="" />
    ) : (
      <span className="trainer-table-sprite" aria-hidden="true" />
    )
  }
  return (
    <span
      className="trainer-table-sprite"
      aria-hidden="true"
      style={{ backgroundImage: `url(${trainer.spriteUrl})` }}
    />
  )
}

export function TrainerTable({
  trainers,
  all,
  showLocation = false,
  onOpen,
}: TrainerTableProps) {
  return (
    <div className="move-table-wrap">
      <table className="move-table trainer-table">
        <thead>
          <tr>
            <th aria-label="Sprite" />
            <th>Trainer</th>
            <th>Class</th>
            {showLocation && <th>Location</th>}
            <th>Pokémon</th>
            <th>Teams</th>
          </tr>
        </thead>
        <tbody>
          {trainers.map((trainer) => (
            <tr key={trainer.key}>
              <td>
                <TrainerSprite trainer={trainer} />
              </td>
              <td>
                <button
                  className="move-link"
                  onClick={() => onOpen(trainer.key)}
                >
                  {trainerLabel(trainer, all)}
                </button>
                {trainer.double ? ' · Double' : ''}
              </td>
              <td>{trainer.className}</td>
              {showLocation && (
                <td>
                  {trainer.locations
                    .map((location) => formatLocation(location.route))
                    .join(', ')}
                </td>
              )}
              <td>{trainer.partySize}</td>
              <td>{trainer.variantCount > 1 ? trainer.variantCount : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
