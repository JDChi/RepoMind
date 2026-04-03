import { marked } from 'marked'

interface Props {
  report: string
  disabled: boolean
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportButton({ report, disabled }: Props) {
  const exportMd = () => download('repomind-report.md', report, 'text/markdown')

  const exportHtml = async () => {
    const body = await marked(report)
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>RepoMind Report</title>
<style>
  body { max-width: 900px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, sans-serif; line-height: 1.6; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; }
  code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 4px; overflow-x: auto; }
</style>
</head>
<body>${body}</body>
</html>`
    download('repomind-report.html', html, 'text/html')
  }

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button onClick={exportMd} disabled={disabled} style={{ padding: '8px 16px' }}>
        导出 Markdown
      </button>
      <button onClick={exportHtml} disabled={disabled} style={{ padding: '8px 16px' }}>
        导出 HTML
      </button>
    </div>
  )
}
