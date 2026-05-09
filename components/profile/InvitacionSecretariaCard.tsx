"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUserRole } from "@/lib/use-user-role";
import { useMounted } from "@/lib/use-mounted";
import {
  generateInvitationToken,
  getActiveInvitation,
} from "@/app/actions/invitations";

type InviteState = {
  token: string;
  expiresAt: string;
} | null;

// El tsconfig del proyecto tiene "strict": false, así que los discriminated
// unions con `success: true | false` no narrowean automáticamente. Estos type
// guards user-defined sí narrowean incluso sin strictNullChecks.
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function isOk<T>(r: ActionResult<T>): r is { success: true; data: T } {
  return r.success === true;
}

function buildInviteUrl(token: string): string {
  const base =
    (typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL) ?? "";
  return `${base}/sign-up/secretaria?token=${token}`;
}

function formatExpiresAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function InvitacionSecretariaCard() {
  const mounted = useMounted();
  const { rol, isLoaded } = useUserRole();

  const [invite, setInvite] = useState<InviteState>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  const shouldRender = mounted && isLoaded && rol === "medico";

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    (async () => {
      setInitialLoading(true);
      try {
        const res = await getActiveInvitation();
        if (cancelled) return;
        if (isOk(res)) {
          setInvite(res.data);
        } else {
          setError(res.error);
        }
      } catch {
        if (!cancelled) setError("No se pudo consultar la invitación activa.");
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldRender]);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    setError(null);
    setCopied(false);
    setGenerating(true);
    try {
      const res = await generateInvitationToken();
      if (isOk(res)) {
        setInvite(res.data);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Error inesperado generando la invitación.");
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!invite) return;
    const url = buildInviteUrl(invite.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar al portapapeles.");
    }
  }, [invite]);

  if (!shouldRender) return null;

  const inviteUrl = invite ? buildInviteUrl(invite.token) : "";

  return (
    <div
      style={{
        padding: 24,
        backgroundColor: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        marginTop: 14,
        marginBottom: 16,
      }}
    >
      <h3 style={{ margin: 0, marginBottom: 8, fontSize: 16 }}>
        Invitar a tu secretaría
      </h3>
      <p
        style={{
          margin: 0,
          marginBottom: 16,
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        Generá un link único para que tu secretaria se registre y quede
        vinculada a tu cuenta. Este link expira en 7 días. Solo puede haber un
        link activo a la vez: si generás uno nuevo, el anterior deja de
        funcionar.
      </p>

      {initialLoading && (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Cargando…
        </div>
      )}

      {!initialLoading && !invite && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            fontSize: 14,
            padding: "8px 16px",
            backgroundColor: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: generating ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: generating ? 0.7 : 1,
          }}
        >
          {generating ? "Generando…" : "Generar link de invitación"}
        </button>
      )}

      {!initialLoading && invite && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 13,
                padding: "4px 10px",
                backgroundColor: "var(--accent-soft)",
                color: "var(--accent-ink)",
                borderRadius: 6,
              }}
            >
              ✓ Invitación activa
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Expira: {formatExpiresAt(invite.expiresAt)}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "stretch",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              value={inviteUrl}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              style={{
                flex: "1 1 320px",
                minWidth: 0,
                fontSize: 12,
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 6,
                backgroundColor: "var(--bg-sunken)",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
              }}
            />
            <button
              onClick={handleCopy}
              disabled={generating}
              style={{
                fontSize: 13,
                padding: "8px 14px",
                backgroundColor: copied ? "var(--accent-soft)" : "var(--bg-sunken)",
                color: copied ? "var(--accent-ink)" : "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ Copiado" : "Copiar link"}
            </button>
          </div>

          <div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                fontSize: 13,
                padding: "6px 12px",
                backgroundColor: "transparent",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                cursor: generating ? "not-allowed" : "pointer",
              }}
            >
              {generating ? "Generando…" : "Generar nuevo link (invalida el actual)"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: "var(--error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
