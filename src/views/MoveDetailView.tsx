import { type MoveCatalogItem } from '../pokemon'
import { MoveAutocomplete } from '../components/MoveAutocomplete'
import { CategoryMetaChip, TypeMetaChip } from './moveMeta'

interface MoveDetailViewProps {
  moveDetail: MoveCatalogItem | null
  moveDetailError: string | null
  loadingMoveDetail: boolean
  moveList: MoveCatalogItem[]
  onOpenMove: (key: string) => void
}

export function MoveDetailView({
  moveDetail,
  moveDetailError,
  loadingMoveDetail,
  moveList,
  onOpenMove,
}: MoveDetailViewProps) {
  return (
    <main className="move-detail-page">
      <MoveAutocomplete moveList={moveList} onSelectMove={onOpenMove} />
      {loadingMoveDetail && <p className="muted">Loading...</p>}
      {moveDetailError && <p className="error">{moveDetailError}</p>}
      {moveDetail && (
        <article className="move-detail-content">
          <h2 className="move-detail-title">{moveDetail.name}</h2>
          <p className="move-key">{moveDetail.key}</p>
          <p className="move-description">
            {moveDetail.description || 'No description available.'}
          </p>
          <p className="move-meta move-detail-meta">
            <TypeMetaChip type={moveDetail.type} />
            <CategoryMetaChip category={moveDetail.category} />
            <span className="meta-text">Power {moveDetail.power > 0 ? moveDetail.power : '-'}</span>
            <span className="meta-text">
              Accuracy {moveDetail.accuracy > 0 ? `${moveDetail.accuracy}%` : '-'}
            </span>
            <span className="meta-text">PP {moveDetail.pp}</span>
          </p>
        </article>
      )}
    </main>
  )
}
