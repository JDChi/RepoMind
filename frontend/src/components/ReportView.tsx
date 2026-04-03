import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
}

export function ReportView({ content }: Props) {
  if (!content) return null
  return (
    <div style={{ lineHeight: '1.6', fontSize: '15px' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
