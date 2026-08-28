import {
  formatAsmIdentifier,
  formatName,
  type ItemDetail,
  type ItemListItem,
} from '../pokemon'

interface ItemDetailViewProps {
  itemDetail: ItemDetail | null
  itemDetailError: string | null
  loadingItemDetail: boolean
  itemList: ItemListItem[]
  allNames: Set<string>
  onOpenItem: (key: string) => void
  onSelectPokemon: (name: string) => void
}

export function ItemDetailView({
  itemDetail,
  itemDetailError,
  loadingItemDetail,
  itemList,
  allNames,
  onOpenItem,
  onSelectPokemon,
}: ItemDetailViewProps) {
  return (
    <main className="move-detail-page !pt-0">
      <div className="block md:hidden">
        <input
          className="search"
          type="search"
          placeholder="Jump to item by name or key..."
          onChange={(event) => {
            const query = event.target.value.trim().toLowerCase()
            if (!query) return
            const match = itemList.find(
              (item) =>
                item.key.toLowerCase() === query ||
                item.name.toLowerCase() === query,
            )
            if (match) onOpenItem(match.key)
          }}
        />
      </div>
      {loadingItemDetail && <p className="muted">Loading...</p>}
      {itemDetailError && <p className="error">{itemDetailError}</p>}
      {itemDetail && (
        <article className="move-detail-content">
          <h2 className="move-detail-title">
            {itemDetail.iconUrl && (
              <img
                className="item-icon item-icon-lg"
                src={itemDetail.iconUrl}
                alt=""
                aria-hidden="true"
              />
            )}
            {itemDetail.name}
          </h2>
          <p className="move-key">{itemDetail.key}</p>
          <p className="move-description">
            {itemDetail.description || 'No description available.'}
          </p>

          <section className="item-location-section">
            <h3 className="route-detail-table-title">
              Found in Maps ({itemDetail.maps.length})
            </h3>
            {itemDetail.maps.length === 0 ? (
              <p className="muted">No scripted giveitem locations found.</p>
            ) : (
              <ul className="encounter-inline-list">
                {itemDetail.maps.map((mapName) => (
                  <li key={`map-${itemDetail.key}-${mapName}`}>
                    {formatAsmIdentifier(mapName)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="item-location-section">
            <h3 className="route-detail-table-title">
              Available in Stores ({itemDetail.marts.length})
            </h3>
            {itemDetail.marts.length === 0 ? (
              <p className="muted">No marts currently sell this item.</p>
            ) : (
              <ul className="encounter-inline-list">
                {itemDetail.marts.map((martName) => (
                  <li key={`mart-${itemDetail.key}-${martName}`}>
                    {formatAsmIdentifier(martName)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="item-location-section">
            <h3 className="route-detail-table-title">
              Wild Pokemon Held Item ({itemDetail.wildHolders.length})
            </h3>
            {itemDetail.wildHolders.length === 0 ? (
              <p className="muted">No wild Pokemon hold this item.</p>
            ) : (
              <ul className="held-items-list">
                {itemDetail.wildHolders.map((holder) => (
                  <li key={`wild-holder-${holder.name}-${holder.region}`}>
                    <button
                      className="move-link"
                      onClick={() => onSelectPokemon(holder.name)}
                    >
                      {formatName(holder.name, holder.region, allNames)}
                    </button>
                    <span className="held-item-rate">{holder.rate}%</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>
      )}
    </main>
  )
}
