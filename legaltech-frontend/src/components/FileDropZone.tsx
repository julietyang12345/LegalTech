import { useRef, useState } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
type PendingFile = { id: string; file: File; documentType: string };
type FileDropZoneProps = { matterId?: string; busy: boolean; onUploaded: () => void };
const documentTypes = [['email', 'Email'], ['contract', 'Contract'], ['change_order', 'Change order'], ['rfi', 'RFI'], ['invoice', 'Invoice'], ['project_log', 'Project log'], ['other', 'Other']];

export default function FileDropZone({ matterId, busy, onUploaded }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, documentType: 'email' }));
    if (next.length) { setPending((current) => [...current, ...next]); setError(''); setMessage(`${next.length} document${next.length === 1 ? '' : 's'} ready. Choose a type before uploading.`); }
  }
  function removeFile(id: string) { setPending((current) => current.filter((item) => item.id !== id)); }
  function setFileType(id: string, documentType: string) { setPending((current) => current.map((item) => item.id === id ? { ...item, documentType } : item)); }
  async function uploadAll() {
    if (!matterId) { setError('Create a workspace before uploading evidence.'); return; }
    setUploading(true); setError('');
    try {
      for (const item of pending) {
        const form = new FormData(); form.append('file', item.file); form.append('matter_id', matterId); form.append('document_type', item.documentType); form.append('sender', 'uploaded-user'); form.append('subject', item.file.name);
        const response = await fetch(`${API_BASE}/api/documents/upload`, { method: 'POST', body: form });
        if (!response.ok) throw new Error((await response.text()) || `${response.status} ${response.statusText}`);
      }
      setMessage(`${pending.length} document${pending.length === 1 ? '' : 's'} uploaded and queued for legal detection.`); setPending([]); onUploaded();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to upload these files.'); }
    finally { setUploading(false); }
  }

  return <section id="evidence-dropzone" className={`file-dropzone ${dragging ? 'dragging' : ''}`}>
    <input ref={inputRef} type="file" hidden multiple onChange={(event) => { addFiles(event.target.files || []); event.target.value = ''; }} />
    <button type="button" className="file-dropzone-target" onClick={() => inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }} disabled={busy || uploading}>
      {uploading ? <Loader2 className="spin" size={19} /> : <FileUp size={19} />}<span><strong>{uploading ? 'Uploading…' : pending.length ? `${pending.length} document${pending.length === 1 ? '' : 's'} selected` : 'Select a document or drag it here'}</strong><small>{pending.length ? 'Choose the document type below' : 'Drop a document here, then choose its type.'}</small></span>
    </button>
    {message && <p className="file-dropzone-status">{message}</p>}
    {pending.length > 0 && <div className="pending-files">{pending.map((item) => <div className="pending-file" key={item.id}>
      <span title={item.file.name}>{item.file.name}</span>
      <select value={item.documentType} onChange={(event) => setFileType(item.id, event.target.value)} disabled={uploading} aria-label={`Document type for ${item.file.name}`}>
        {documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
      <button type="button" className="icon-button" onClick={() => removeFile(item.id)} disabled={uploading} aria-label={`Remove ${item.file.name}`}><X size={14} /></button>
    </div>)}<button type="button" className="button primary upload-pending" onClick={() => void uploadAll()} disabled={busy || uploading}>{uploading ? <><Loader2 className="spin" size={15} /> Uploading</> : `Upload ${pending.length} document${pending.length === 1 ? '' : 's'}`}</button></div>}
    {error && <small className="file-dropzone-error">{error}</small>}
  </section>;
}
