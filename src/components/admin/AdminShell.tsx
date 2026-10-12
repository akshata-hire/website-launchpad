'use client'

import { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'

export function AdminShell({
  children,
  userSlot,
}: {
  children: React.ReactNode
  userSlot?: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div
        className={
          collapsed ? 'ml-14 min-h-screen flex flex-col' : 'ml-56 min-h-screen flex flex-col'
        }
      >
        {userSlot ? (
          <header className="flex h-12 shrink-0 items-center justify-end border-b border-gray-200 bg-white px-4">
            {userSlot}
          </header>
        ) : null}
        {children}
      </div>
    </div>
  )
}
