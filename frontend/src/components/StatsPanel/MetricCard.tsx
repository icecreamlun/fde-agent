interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  colorCode?: boolean
  rawValue?: number
}

export default function MetricCard({ label, value, unit, colorCode, rawValue }: MetricCardProps) {
  const numericRaw = rawValue ?? (typeof value === 'number' ? value : undefined)

  let valueColor = 'text-slate-100'
  if (colorCode && numericRaw !== undefined) {
    if (numericRaw >= 0.9) valueColor = 'text-green-400'
    else if (numericRaw <= 0.2) valueColor = 'text-red-400'
  }

  return (
    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
      <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${valueColor}`}>
        {value}{unit}
      </div>
    </div>
  )
}
