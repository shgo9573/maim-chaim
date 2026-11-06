import React from 'react';
import { createPortal } from 'react-dom';
import { TzuratHaDafView, parseDafString } from './TzuratHaDafView';
import { findShasTractate, SHAS_MAP } from '../utils/shasTractates';

export { findShasTractate, parseDafString, SHAS_MAP };

export interface TzuratHaDafModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookTitle: string;
  bookId?: number | string;
  initialDaf?: string;
  isDarkTheme?: boolean;
}

/**
 * Render the viewer at document.body level. BookReader and its tabs use
 * positioned/overflow containers; putting a fixed modal inside them makes
 * it cover only the reader pane and leaves the app visible behind the page.
 */
export const TzuratHaDafModal: React.FC<TzuratHaDafModalProps> = ({
  isOpen,
  onClose,
  bookTitle,
  bookId,
  initialDaf,
  isDarkTheme
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[10000] flex items-stretch justify-stretch ${isDarkTheme ? 'bg-[#120D0A]' : 'bg-[#FAF8F5]'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`צורת הדף — ${bookTitle}`}
    >
      <div className={`relative h-full w-full overflow-hidden ${isDarkTheme ? 'bg-[#120D0A]' : 'bg-[#FAF8F5]'}`}>
        <TzuratHaDafView
          bookTitle={bookTitle}
          bookId={bookId}
          initialDaf={initialDaf}
          settings={{ theme: isDarkTheme ? 'dark' : 'sepia' } as any}
          onCloseTab={onClose}
        />
      </div>
    </div>,
    document.body
  );
};

export default TzuratHaDafView;
