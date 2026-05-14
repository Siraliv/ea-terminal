import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { BracketedButton, FramedPanel } from '@/components/ui';
import { DropZone } from '@/components/upload/DropZone';
import {
  FilePreviewCard,
  type SlotState,
} from '@/components/upload/FilePreviewCard';
import { parseMt5HtmlFile } from '@/domain/mt5/parseHtml';
import { parseMt5XlsxFile } from '@/domain/mt5/parseXlsx';
import { useUploadTest } from '@/hooks/useTests';

function makeSlotId(): string {
  return crypto.randomUUID();
}

function detectFormat(file: File): 'xlsx' | 'html' | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.htm') || name.endsWith('.html')) return 'html';
  return null;
}

export function UploadPage() {
  const navigate = useNavigate();
  const upload = useUploadTest();
  const [slots, setSlots] = useState<SlotState[]>([]);

  const updateSlot = useCallback(
    (id: string, patch: Partial<SlotState>) => {
      setSlots((cur) =>
        cur.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
    },
    [],
  );

  const onFiles = useCallback(
    async (files: File[]) => {
      const newSlots: SlotState[] = files.map((file) => ({
        id: makeSlotId(),
        file,
        status: 'pending',
      }));
      setSlots((cur) => [...cur, ...newSlots]);

      // Parse each file in sequence (fast enough; keeps memory pressure
      // low if user drops 20 files at once).
      for (const slot of newSlots) {
        const fmt = detectFormat(slot.file);
        if (fmt == null) {
          updateSlot(slot.id, {
            status: 'error',
            error: `Unsupported file type: ${slot.file.name}`,
          });
          continue;
        }
        updateSlot(slot.id, { status: 'parsing' });
        try {
          const parsed =
            fmt === 'html'
              ? await parseMt5HtmlFile(slot.file)
              : await parseMt5XlsxFile(slot.file);
          updateSlot(slot.id, { status: 'parsed', parsed });
        } catch (err) {
          updateSlot(slot.id, {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
    [updateSlot],
  );

  const onSave = useCallback(
    async (slot: SlotState) => {
      if (!slot.parsed) return;
      updateSlot(slot.id, { status: 'saving' });
      try {
        const result = await upload.mutateAsync({
          parsed: slot.parsed,
          file: slot.file,
        });
        updateSlot(slot.id, {
          status: result.duplicate ? 'duplicate' : 'saved',
          testId: result.test.id,
        });
      } catch (err) {
        updateSlot(slot.id, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [upload, updateSlot],
  );

  const onSaveAll = useCallback(async () => {
    const ready = slots.filter((s) => s.status === 'parsed');
    for (const s of ready) {
      // eslint-disable-next-line no-await-in-loop
      await onSave(s);
    }
  }, [slots, onSave]);

  const onRemove = useCallback((id: string) => {
    setSlots((cur) => cur.filter((s) => s.id !== id));
  }, []);

  const onOpen = useCallback(
    (testId: string) => {
      navigate(`/tests/${testId}`);
    },
    [navigate],
  );

  const onClearAll = useCallback(() => setSlots([]), []);

  const readyCount = slots.filter((s) => s.status === 'parsed').length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="UPLOAD"
        subtitle="Drop MT5 .xlsx or .html exports — parsed on the spot, saved on confirm"
        actions={
          slots.length > 0 ? (
            <>
              {readyCount > 0 ? (
                <BracketedButton
                  variant="primary"
                  size="sm"
                  onClick={onSaveAll}
                >
                  Save All ({readyCount})
                </BracketedButton>
              ) : null}
              <BracketedButton variant="secondary" size="sm" onClick={onClearAll}>
                Clear
              </BracketedButton>
            </>
          ) : null
        }
      />

      <FramedPanel title="DROP ZONE">
        <DropZone onFiles={onFiles} />
      </FramedPanel>

      {slots.length > 0 ? (
        <div className="flex flex-col gap-3">
          {slots.map((slot) => (
            <FilePreviewCard
              key={slot.id}
              slot={slot}
              onSave={onSave}
              onRemove={onRemove}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
