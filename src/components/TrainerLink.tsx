import { trainerLabel, type TrainerListItem } from '../trainers'

interface TrainerLinkProps {
  trainer: TrainerListItem
  all: TrainerListItem[]
  onOpen: (key: string) => void
}

export function TrainerLink({ trainer, all, onOpen }: TrainerLinkProps) {
  return (
    <button className="trainer-card" onClick={() => onOpen(trainer.key)}>
      {trainer.picUrl ? (
        <img
          className="trainer-card-pic"
          src={trainer.picUrl}
          alt=""
          loading="lazy"
        />
      ) : (
        <span className="trainer-card-pic" aria-hidden="true" />
      )}
      <span className="trainer-card-text">
        <span className="trainer-card-name">{trainerLabel(trainer, all)}</span>
        <span className="trainer-card-meta">
          {trainer.className}
          {trainer.double ? ' · Double' : ''} · {trainer.partySize} Pokémon
        </span>
      </span>
    </button>
  )
}
