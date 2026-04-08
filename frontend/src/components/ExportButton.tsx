import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { trackButtonClick } from '../analytics'

interface Props {
  report: string
  disabled: boolean
  repos: string[]
  apiBaseUrl: string
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

export function ExportButton({ report, disabled, repos, apiBaseUrl }: Props) {
  const exportMd = () => {
    void trackButtonClick({
      apiBaseUrl,
      eventName: 'export_markdown_click',
      buttonLabel: 'Markdown',
      repoInputs: repos,
    })
    download('repomind-report.md', report, 'text/markdown')
  }

  const exportHtml = async () => {
    void trackButtonClick({
      apiBaseUrl,
      eventName: 'export_html_click',
      buttonLabel: 'HTML',
      repoInputs: repos,
    })
    const body = await marked(report)
    const safeBody = DOMPurify.sanitize(body)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>RepoMind Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  body { max-width: 720px; margin: 60px auto; padding: 0 24px; font-family: 'Instrument Sans', system-ui, sans-serif; background: #FAFAF8; color: #1A1917; line-height: 1.8; }
  h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 2rem; font-weight: 800; color: #1A1917; border-bottom: 1px solid #E7E5E0; padding-bottom: 16px; margin-bottom: 20px; }
  h2 { font-family: 'Playfair Display', Georgia, serif; font-size: 1.25rem; font-weight: 700; color: #1A1917; margin-top: 36px; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #E7E5E0; }
  h3 { font-family: 'Playfair Display', Georgia, serif; font-size: 1rem; font-weight: 600; color: #1A1917; margin-top: 24px; margin-bottom: 8px; }
  p { color: #6B6963; margin-bottom: 14px; font-size: 15px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 20px; border: 1px solid #E7E5E0; border-radius: 5px; overflow: hidden; }
  th { background: #F5F3EE; font-weight: 600; text-align: left; padding: 10px 14px; border-bottom: 1px solid #E7E5E0; color: #1A1917; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px; }
  td { padding: 10px 14px; border-bottom: 1px solid #E7E5E0; color: #6B6963; }
  code { font-family: 'JetBrains Mono', monospace; background: #F5F3EE; padding: 2px 7px; border-radius: 4px; color: #B45309; border: 1px solid #E7E5E0; font-size: 12.5px; }
  pre { background: #F5F3EE; border: 1px solid #E7E5E0; border-radius: 5px; padding: 18px 20px; overflow-x: auto; margin-bottom: 16px; }
  pre code { background: none; padding: 0; border: none; color: #1A1917; font-size: 13px; }
  blockquote { border-left: 3px solid #B45309; margin: 24px 0; padding: 14px 20px; background: #FEF3C7; border-radius: 0 5px 5px 0; }
  blockquote p { font-family: 'Playfair Display', Georgia, serif; font-size: 15.5px; color: #1A1917; margin: 0; }
  strong { color: #1A1917; font-weight: 600; }
</style>
</head>
<body>${safeBody}</body>
</html>`
    download('repomind-report.html', html, 'text/html')
  }

  return (
    <div className="export-row">
      <button className="export-btn" onClick={exportMd} disabled={disabled}>Markdown</button>
      <button className="export-btn" onClick={exportHtml} disabled={disabled}>HTML</button>
    </div>
  )
}
