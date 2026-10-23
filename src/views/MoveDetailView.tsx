import { moveAccuracy, type MoveCatalogItem } from '../pokemon'
import { tmIconUrl } from '../itemCategories'
import { MoveAutocomplete } from '../components/MoveAutocomplete'
import {
  CategoryMetaChip,
  TypeMetaChip,
  moveTags,
  moveTargetInfo,
} from './moveMeta'

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
    <main className="move-detail-page !pt-0">
      <div className="block md:hidden">
        <MoveAutocomplete moveList={moveList} onSelectMove={onOpenMove} />
      </div>
      {loadingMoveDetail && <p className="muted">Loading...</p>}
      {moveDetailError && <p className="error">{moveDetailError}</p>}
      {moveDetail && (
        <article className="move-detail-content">
          <h2 className="move-detail-title">
            <img
              className="item-icon item-icon-lg"
              src={tmIconUrl(moveDetail.type)}
              alt=""
              aria-hidden="true"
            />
            {moveDetail.name}
          </h2>
          <p className="move-key">{moveDetail.key}</p>
          <p className="move-description">
            {moveDetail.description || 'No description available.'}
          </p>
          <p className="move-meta move-detail-meta">
            <TypeMetaChip type={moveDetail.type} />
            <CategoryMetaChip category={moveDetail.category} />
            <span className="meta-text">
              Power {moveDetail.power > 0 ? moveDetail.power : '-'}
            </span>
            <span className="meta-text">
              Accuracy{' '}
              {moveAccuracy(moveDetail) > 0 ? moveAccuracy(moveDetail) : '-'}
            </span>
            <span className="meta-text">PP {moveDetail.pp}</span>
          </p>
          <MoveAttributesList move={moveDetail} />
        </article>
      )}
    </main>
  )
}

function MoveAttributesList({ move }: { move: MoveCatalogItem }) {
  const flags = move.flags ?? []
  const target = moveTargetInfo(move.target ?? 'selected')
  const tags = moveTags(flags)
  return (
    <dl className="move-attributes">
      <dt>Target</dt>
      <dd>{target.label}</dd>
      <dt>Hits multiple targets</dt>
      <dd>{target.multi ? 'Yes' : 'No'}</dd>
      <dt>Makes contact</dt>
      <dd>{flags.includes('contact') ? 'Yes' : 'No'}</dd>
      {tags.length > 0 && (
        <>
          <dt>Tags</dt>
          <dd>{tags.join(', ')}</dd>
        </>
      )}
    </dl>
  )
}
