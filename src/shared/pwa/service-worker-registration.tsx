"use client";

import { useEffect, useRef, useState } from "react";

export function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    const revealUpdate = (worker: ServiceWorker) => {
      waitingWorker.current = worker;
      setUpdateAvailable(true);
    };
    const onControllerChange = () => {
      if (updateRequested.current) window.location.reload();
    };
    const onUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      const onStateChange = () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          revealUpdate(registration?.waiting ?? installing);
        }
      };
      installing.addEventListener("statechange", onStateChange);
    };
    const checkForUpdate = async () => {
      await registration?.update();
      if (registration?.waiting && navigator.serviceWorker.controller) revealUpdate(registration.waiting);
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    window.addEventListener("online", checkForUpdate);
    void navigator.serviceWorker.register("/sw.js").then((result) => {
        registration = result;
        if (result.waiting && navigator.serviceWorker.controller) {
          revealUpdate(result.waiting);
      }
      result.addEventListener("updatefound", onUpdateFound);
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("online", checkForUpdate);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <aside className="pwa-update" aria-labelledby="pwa-update-title" role="status">
      <p id="pwa-update-title"><strong>Hay una actualización disponible.</strong></p>
      <p>Podés aplicarla cuando termines lo que estás haciendo.</p>
      <div className="pwa-update__actions">
        <button type="button" onClick={() => {
          if (!waitingWorker.current) return;
          updateRequested.current = true;
          waitingWorker.current.postMessage({ type: "SKIP_WAITING" });
        }}>Actualizar ahora</button>
        <button className="pwa-update__dismiss" type="button" onClick={() => setUpdateAvailable(false)}>Más tarde</button>
      </div>
    </aside>
  );
}
