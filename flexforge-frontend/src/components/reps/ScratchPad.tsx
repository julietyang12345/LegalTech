import { useCallback, useRef } from 'react';
import { FileText } from 'lucide-react';
import { useRepsStore } from '@/stores/repsStore';

export function ScratchPad() {
  const { scratchPadContent, setScratchPad } = useRepsStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    // Debounce store updates
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setScratchPad(value);
    }, 300);
    // Immediate local update via uncontrolled behavior
    // Actually, let's keep it controlled for simplicity
    setScratchPad(value);
  }, [setScratchPad]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <FileText className="w-4 h-4 text-content-tertiary" />
        <span className="text-sm font-medium text-content-secondary">Scratch Pad</span>
        <span className="text-xs text-content-tertiary ml-auto">Auto-saved</span>
      </div>
      <textarea
        value={scratchPadContent}
        onChange={handleChange}
        placeholder="Take notes, write code, plan your approach..."
        className="flex-1 w-full p-4 bg-surface text-content text-sm font-mono
                   placeholder:text-content-tertiary resize-none border-0
                   focus:outline-none focus:ring-0"
      />
    </div>
  );
}
