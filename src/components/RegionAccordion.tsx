import { useState, type ReactNode } from 'react'
import { regionGroupLabel } from '../pokemon'

interface RegionAccordionProps {
  group: string
  forceOpen?: boolean
  children: ReactNode
}

export function RegionAccordion({
  group,
  forceOpen = false,
  children,
}: RegionAccordionProps) {
  const [open, setOpen] = useState(true)
  const isOpen = forceOpen || open
  return (
    <section className="region-accordion">
      <button
        className={`region-accordion-toggle locations-sidebar-region-toggle locations-sidebar-region-toggle-${group}`}
        onClick={() => setOpen(!open)}
        aria-expanded={isOpen}
      >
        <span>{regionGroupLabel(group)}</span>
        <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && <div className="region-accordion-content">{children}</div>}
    </section>
  )
}
