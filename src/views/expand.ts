import { el, icon } from '../ui/components';

/** Adds the expand / restore button to the head of a kit modal and marks the modal as filling the window or not. */
export function makeExpandable(overlay: HTMLElement, expanded: boolean, onToggle: (on: boolean) => void): void {
    const box = overlay.querySelector<HTMLElement>('.modal')!;
    overlay.classList.add('is-sizable');
    if (expanded) {
        box.classList.add('is-expanded');
        overlay.classList.add('is-expanded');
    }
    const button = el('button', 'icon-btn modal-expand');
    button.type = 'button';
    button.setAttribute('aria-label', expanded ? 'Restore size' : 'Expand');
    button.setAttribute('aria-pressed', String(expanded));
    button.title = expanded ? 'Restore size' : 'Fill the window';
    button.append(icon(expanded ? 'minimize' : 'maximize'));
    button.addEventListener('click', () => onToggle(!expanded));
    box.querySelector('.modal-head')!.insertBefore(button, box.querySelector('.modal-close'));
}
