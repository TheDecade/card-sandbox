import { useRef, useState } from 'react';
import type { ImageId } from '../../domain/cards/types';
import type { ImageMeta } from '../../domain/images/types';
import { processImages } from '../../images/processImage';
import { useImageUrl } from '../../images/useImageUrl';
import { useLibrary } from '../../state/libraryStore';
import { Modal } from '../../ui/Modal';

/** Grid of the image library, plus importing new images from Photos / Files. */
export function ImagePicker({
  selected,
  onSelect,
  onClose,
}: {
  selected: ImageId | null;
  onSelect: (id: ImageId | null) => void;
  onClose: () => void;
}) {
  const images = useLibrary((s) => s.images);
  const addImages = useLibrary((s) => s.addImages);
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const newestFirst = [...images].reverse();

  async function importFiles(files: File[]) {
    if (files.length === 0) return;
    setProblem(null);
    setProgress(`Importing 0 of ${files.length}…`);
    try {
      const { images: added, failed } = await processImages(files, (done, total) =>
        setProgress(`Importing ${done} of ${total}…`),
      );
      await addImages(added);
      if (failed.length > 0) setProblem(`Couldn't read: ${failed.join(', ')}`);
      // A single image was probably picked for this card: use it straight away.
      if (added.length === 1 && failed.length === 0) onSelect(added[0]!.id);
    } catch (e) {
      setProblem(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="dialog dialog-wide image-picker" role="dialog" aria-modal="true" aria-label="Choose image">
        <div className="picker-head">
          <h3>Choose image</h3>
          <button
            className="btn btn-primary"
            disabled={progress !== null}
            onClick={() => fileInput.current?.click()}
          >
            Import images…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = ''; // allow picking the same file again
              void importFiles(files);
            }}
          />
        </div>
        {progress && <p className="picker-status">{progress}</p>}
        {problem && <p className="picker-status picker-problem">{problem}</p>}

        <div className="image-grid">
          <button
            className={`image-tile image-none${selected === null ? ' is-selected' : ''}`}
            onClick={() => onSelect(null)}
          >
            No image
          </button>
          {newestFirst.map((img) => (
            <ImageTile key={img.id} image={img} selected={img.id === selected} onSelect={onSelect} />
          ))}
        </div>
        {images.length === 0 && (
          <p className="muted">No images yet. Import some from Photos or the Files app.</p>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ImageTile({
  image,
  selected,
  onSelect,
}: {
  image: ImageMeta;
  selected: boolean;
  onSelect: (id: ImageId) => void;
}) {
  const url = useImageUrl(image.id, 'thumb');
  return (
    <button
      className={`image-tile${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(image.id)}
      aria-label={image.name}
      title={image.name}
    >
      {url && <img src={url} alt="" draggable={false} />}
    </button>
  );
}
