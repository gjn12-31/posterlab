import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  close,
  children,
  className = "",
  dismissible = true,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      className={"pr-dialog " + className}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) close();
      }}
      aria-label={title}
    >
      <div className="pr-dialoghead">
        <h2>{title}</h2>
        {dismissible && (
          <button aria-label="关闭" onClick={close}>
            <X />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
