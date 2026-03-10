import { createPortal } from 'react-dom';

/**
 * Portal component to render children outside the current DOM hierarchy.
 * Useful for overcoming overflow: hidden / clipping issues.
 */
export default function Portal({ children }) {
    return createPortal(children, document.body);
}
