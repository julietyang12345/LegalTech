import { useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

export type WorkspaceValues = { matterName: string; projectName: string; projectNumber: string; siteAddress: string };
type WorkspaceFormProps = { busy: boolean; onSubmit: (values: WorkspaceValues) => Promise<boolean>; onClose: () => void };
const emptyValues: WorkspaceValues = { matterName: '', projectName: '', projectNumber: '', siteAddress: '' };
// The detector matches uploaded evidence by project number, so that field
// carries the hint users need to fill it well.
const fields: { key: keyof WorkspaceValues; label: string; placeholder: string; hint?: string; required?: boolean }[] = [
  { key: 'matterName', label: 'Matter name', placeholder: 'e.g. Harbor Tower delay claim', required: true },
  { key: 'projectName', label: 'Project name', placeholder: 'e.g. Harbor Tower', required: true },
  { key: 'projectNumber', label: 'Project number', placeholder: 'e.g. PRJ-100', hint: 'Evidence that mentions this number is linked to the project automatically.', required: true },
  { key: 'siteAddress', label: 'Site address', placeholder: 'Optional' },
];

export default function WorkspaceForm({ busy, onSubmit, onClose }: WorkspaceFormProps) {
  const [values, setValues] = useState<WorkspaceValues>(emptyValues);
  const missing = fields.some((field) => field.required && !values[field.key].trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missing || busy) return;
    const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as WorkspaceValues;
    if (await onSubmit(trimmed)) setValues(emptyValues);
  }

  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="modal-panel workspace-form" onSubmit={(event) => void submit(event)} aria-labelledby="workspace-form-title">
      <div className="modal-heading">
        <div><h2 id="workspace-form-title">New matter</h2><p>Set up the matter and project that evidence will be analyzed against.</p></div>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close"><X size={16} /></button>
      </div>
      {fields.map((field) => <label className="field" key={field.key}>
        <span>{field.label}{field.required && <em className="required-mark"> *</em>}</span>
        <input value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} required={field.required} disabled={busy} autoFocus={field.key === 'matterName'} />
        {field.hint && <small>{field.hint}</small>}
      </label>)}
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="button primary" disabled={missing || busy}>{busy ? <><Loader2 className="spin" size={15} /> Creating</> : 'Create matter'}</button>
      </div>
    </form>
  </div>;
}
