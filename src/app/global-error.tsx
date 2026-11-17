"use client";

import { useEffect } from "react";

// Replaces the root layout when it crashes, so it carries its own <html>/<body> and inline styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#0b0a12",
          color: "#f6efdc",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ color: "#f3d98b", fontSize: 28, margin: 0 }}>ระบบขัดข้องชั่วคราว</h1>
        <p style={{ maxWidth: 360, opacity: 0.8, margin: 0 }}>ขออภัยค่ะ กรุณาลองใหม่อีกครั้ง</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            height: 44,
            padding: "0 24px",
            borderRadius: 999,
            border: 0,
            background: "#d4af37",
            color: "#0b0a12",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ลองใหม่
        </button>
      </body>
    </html>
  );
}
