'use client';

interface ExportButtonsProps {
  contractId: string;
  humanReadable: string;
  machineReadable: Record<string, unknown>;
  sha256Hash: string;
}

function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export contract as JSON, Markdown, or plain text.
 * Pure client-side — no server dependency.
 */
export default function ExportButtons({
  contractId,
  humanReadable,
  machineReadable,
  sha256Hash,
}: ExportButtonsProps) {
  function exportJSON() {
    const data = {
      contract_id: contractId,
      sha256_hash: sha256Hash,
      human_readable: humanReadable,
      machine_readable: machineReadable,
      exported_at: new Date().toISOString(),
    };
    download(`${contractId}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  function exportMarkdown() {
    const md = [
      `# ${contractId}`,
      '',
      `**SHA-256:** \`${sha256Hash}\``,
      `**Exported:** ${new Date().toISOString()}`,
      '',
      '---',
      '',
      '## Human-Readable Contract',
      '',
      humanReadable,
      '',
      '---',
      '',
      '## Machine-Parsable Contract',
      '',
      '```json',
      JSON.stringify(machineReadable, null, 2),
      '```',
    ].join('\n');
    download(`${contractId}.md`, md, 'text/markdown');
  }

  function exportText() {
    const txt = [
      `CONTRACT: ${contractId}`,
      `SHA-256: ${sha256Hash}`,
      `EXPORTED: ${new Date().toISOString()}`,
      '',
      '\u2550'.repeat(60),
      '',
      humanReadable,
      '',
      '\u2550'.repeat(60),
      '',
      'MACHINE-PARSABLE FORMAT:',
      '',
      JSON.stringify(machineReadable, null, 2),
    ].join('\n');
    download(`${contractId}.txt`, txt, 'text/plain');
  }

  return (
    <div className="flex items-center gap-2 mb-6">
      <span className="text-xs text-text-secondary mr-1">Export:</span>
      <button
        onClick={exportJSON}
        className="text-xs px-2.5 py-1 rounded-md border border-border bg-surface text-text-secondary hover:text-amber hover:border-amber/30 transition-colors font-mono"
      >
        JSON
      </button>
      <button
        onClick={exportMarkdown}
        className="text-xs px-2.5 py-1 rounded-md border border-border bg-surface text-text-secondary hover:text-amber hover:border-amber/30 transition-colors font-mono"
      >
        Markdown
      </button>
      <button
        onClick={exportText}
        className="text-xs px-2.5 py-1 rounded-md border border-border bg-surface text-text-secondary hover:text-amber hover:border-amber/30 transition-colors font-mono"
      >
        Text
      </button>
    </div>
  );
}
