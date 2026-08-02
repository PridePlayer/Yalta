// 会期圆点（1~7 期）：上移至报头标题行，与「雅尔塔会议」同处一行

interface Props {
  session: number
}

export function SessionDots({ session }: Props) {
  return (
    <div className="session-dots" aria-label={`第 ${session} 会期，共 7 期`}>
      {Array.from({ length: 7 }, (_, i) => (
        <span
          key={i}
          className={`session-dot ${i + 1 < session ? 'done' : ''} ${i + 1 === session ? 'current' : ''} ${i + 1 > session ? 'future' : ''}`}
        >
          {i + 1}
        </span>
      ))}
    </div>
  )
}
