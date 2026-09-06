import type { ReactNode } from "react";

export function DeviceFrame({
  children,
  title,
  status,
}: {
  children: ReactNode;
  title?: string;
  status?: string;
}) {
  return (
    <div className="device">
      <div className="device-speaker" />
      <div className="lcd">
        <div className="lcd-bar">
          <span>{title ?? "CUBE"}</span>
          <span>{status ?? "OK"}</span>
        </div>
        <div className="lcd-body">{children}</div>
      </div>
      <div className="device-buttons" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
