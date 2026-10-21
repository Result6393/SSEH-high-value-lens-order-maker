// "More images": extra photos attached to the email as they are, EXIF-free.
// Shared by both tabs; held in memory only, like all patient data.

import { prepareAttachment } from './image';

export interface ExtrasStep {
  blobs(): Blob[];
  reset(): void;
}

export function initExtras(
  el: { camera: HTMLInputElement; library: HTMLInputElement; list: HTMLUListElement; status: HTMLElement },
  onChange: () => void,
): ExtrasStep {
  let extras: { blob: Blob; url: string }[] = [];

  for (const picker of [el.camera, el.library]) {
    picker.addEventListener('change', () => {
      const files = [...(picker.files ?? [])];
      picker.value = '';
      if (files.length) void add(files);
    });
  }

  async function add(files: File[]): Promise<void> {
    const failed: string[] = [];
    for (const file of files) {
      try {
        const blob = await prepareAttachment(file);
        extras.push({ blob, url: URL.createObjectURL(blob) });
      } catch {
        failed.push(file.name || 'an image');
      }
    }
    el.status.hidden = !failed.length;
    el.status.textContent = failed.length ? `Couldn't read ${failed.join(', ')}.` : '';
    render();
    onChange();
  }

  function render(): void {
    el.list.replaceChildren(
      ...extras.map((x, i) => {
        const li = document.createElement('li');
        const img = Object.assign(document.createElement('img'), { src: x.url, alt: `Extra image ${i + 1}` });
        const remove = Object.assign(document.createElement('button'), {
          type: 'button',
          textContent: '×',
          ariaLabel: `Remove extra image ${i + 1}`,
        });
        remove.addEventListener('click', () => {
          URL.revokeObjectURL(x.url);
          extras = extras.filter((e) => e !== x);
          render();
          onChange();
        });
        li.append(img, remove);
        return li;
      }),
    );
  }

  return {
    blobs: () => extras.map((x) => x.blob),
    reset() {
      for (const x of extras) URL.revokeObjectURL(x.url);
      extras = [];
      render();
      el.status.hidden = true;
    },
  };
}
