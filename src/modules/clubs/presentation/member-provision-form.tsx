"use client";

import { useActionState } from "react";
import { provisionMemberFormAction, type ProvisionMemberState } from "./member-actions";
import { ActionResult } from "@/shared/ui/action-result";
import { SubmitButton } from "@/shared/ui/submit-button";

const initialState: ProvisionMemberState = { status: "idle" };

export function MemberProvisionForm({ clubId, units }: { clubId: string; units: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(provisionMemberFormAction, initialState);

  return <form className="card form-stack" action={action}>
    <input type="hidden" name="clubId" value={clubId}/>
    <p className="form-field"><label htmlFor="fullName">Nombre completo</label><input id="fullName" name="fullName" required maxLength={120}/></p>
    <p className="form-field"><label htmlFor="dateOfBirth">Fecha de nacimiento</label><input id="dateOfBirth" name="dateOfBirth" type="date" required/></p>
    <p className="form-field"><label htmlFor="unitId">Unidad</label><select id="unitId" name="unitId" required>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></p>
    <p className="form-field"><label htmlFor="staffRole">Rol operativo (opcional)</label><select id="staffRole" name="staffRole"><option value="">Sin rol</option><option value="INSTRUCTOR">Instructor (puede tener varias unidades)</option><option value="COUNSELOR">Consejero (máximo una unidad)</option></select></p>
    <p className="form-field"><label htmlFor="username">Nombre de usuario interno</label><input id="username" name="username" required pattern="[a-z0-9][a-z0-9._-]{2,63}" autoComplete="off"/></p>
    <SubmitButton pendingLabel="Registrando…">Registrar y revelar una vez</SubmitButton>
    {state.status === "success" ? <div className="stack" aria-live="assertive"><ActionResult kind="success" message={`Anote ahora las credenciales: usuario ${state.username}; contraseña temporal ${state.temporaryPassword}. No se mostrarán de nuevo.`}/><p>Esta es la única visualización. No recargue ni comparta esta pantalla.</p></div> : null}
    {state.status === "error" ? <ActionResult kind="error" message="No fue posible completar el registro. Verifique los datos e intente nuevamente."/> : null}
  </form>;
}
