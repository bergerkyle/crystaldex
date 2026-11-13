import { TrainerSprite } from './TrainerSprite'
import { trainerLabel, type TrainerListItem } from '../trainers'

interface TrainerTableProps {
  trainers: TrainerListItem[]
  all: TrainerListItem[]
  title?: string
  onOpen: (key: string) => void
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
                {trainer.spriteUrl && (
                  <TrainerSprite
                    src={trainer.spriteUrl}
                    palette={trainer.spritePalette}
                  />
                )}
              </td>
              <td className="move-table-name-cell">
                {trainerLabel(trainer, all)}
              </td>
              <td>{trainer.className}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
