import { trainerLabel, type TrainerListItem } from '../trainers'

interface TrainerTableProps {
  trainers: TrainerListItem[]
  all: TrainerListItem[]
  title?: string
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
  title,
  onOpen,
}: TrainerTableProps) {
  return (
    <div className="move-table-wrap">
      <table className="move-table trainer-table">
        {title && (
          <thead>
            <tr>
              <th colSpan={3} className="trainer-table-title">
                {title}
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {trainers.map((trainer) => (
            <tr
              key={trainer.key}
              className="move-table-row"
              onClick={() => onOpen(trainer.key)}
            >
              <td>
                <TrainerSprite trainer={trainer} />
              </td>
              <td className="move-table-name-cell">
                {trainerLabel(trainer, all)}
                {trainer.double ? ' · Double' : ''}
              </td>
              <td>{trainer.className}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
