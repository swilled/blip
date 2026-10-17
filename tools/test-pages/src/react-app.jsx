import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function reportState(state) {
  window.blipReport?.("react-state", state);
}

function ReactForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [requiredNote, setRequiredNote] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [room, setRoom] = useState("");
  const [breakfast, setBreakfast] = useState(false);
  const [bed, setBed] = useState("");
  const [touchedName, setTouchedName] = useState(false);
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [touchedNote, setTouchedNote] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameError = (touchedName || submitted) && !fullName.trim()
    ? "Full name is required."
    : "";
  const emailError = (touchedEmail || submitted)
    ? (!email.trim() ? "Email address is required."
      : (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email address." : ""))
    : "";
  const noteError = touchedNote && !requiredNote.trim() ? "This field is required." : "";

  useEffect(() => {
    reportState({
      values: { fullName, email, requiredNote, promoCode, room, breakfast, bed },
      errors: { fullName: nameError, email: emailError, requiredNote: noteError },
      touched: { fullName: touchedName, email: touchedEmail, requiredNote: touchedNote },
      submitted,
    });
  }, [
    fullName, email, requiredNote, promoCode, room, breakfast, bed,
    nameError, touchedName, touchedEmail, touchedNote, noteError, submitted,
  ]);

  function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    reportState({ submitAttempted: true });
  }

  return (
    <main>
      <h1>React controlled form</h1>
      <p>Controlled fields report their current values and validation state after each interaction.</p>
      <form id="react-form" noValidate onSubmit={handleSubmit}>
        <div>
          <label htmlFor="full-name">Full name</label>
          <input
            id="full-name"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "full-name-error" : undefined}
            onChange={(event) => setFullName(event.currentTarget.value)}
            onBlur={() => setTouchedName(true)}
          />
          {nameError && <p id="full-name-error" role="alert">{nameError}</p>}
        </div>

        <div>
          <label htmlFor="email-address">Email address</label>
          <input
            id="email-address"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "email-error" : undefined}
            onChange={(event) => setEmail(event.currentTarget.value)}
            onBlur={() => setTouchedEmail(true)}
          />
          {emailError && <p id="email-error" role="alert">{emailError}</p>}
        </div>

        <div>
          <label htmlFor="required-note">Required note</label>
          <input
            id="required-note"
            name="requiredNote"
            type="text"
            required
            value={requiredNote}
            aria-invalid={Boolean(noteError)}
            aria-describedby={noteError ? "required-note-error" : undefined}
            onChange={(event) => setRequiredNote(event.currentTarget.value)}
            onBlur={() => setTouchedNote(true)}
          />
          {noteError && <p id="required-note-error" role="alert">{noteError}</p>}
        </div>

        <div>
          <label htmlFor="promo-code">Promo code</label>
          <input
            id="promo-code"
            name="promoCode"
            type="text"
            maxLength={8}
            value={promoCode}
            onChange={(event) => setPromoCode(event.currentTarget.value.slice(0, 8).toUpperCase())}
          />
          <small>Up to 8 characters; letters are converted to uppercase.</small>
        </div>

        <div>
          <label htmlFor="room-type">Room type</label>
          <select id="room-type" name="room" value={room} onChange={(event) => setRoom(event.currentTarget.value)}>
            <option value="">Choose a room</option>
            <option value="standard">Standard</option>
            <option value="deluxe">Deluxe</option>
            <option value="suite">Suite</option>
          </select>
        </div>

        <fieldset>
          <legend>Bed preference</legend>
          <label><input type="radio" name="bed" value="king" checked={bed === "king"} onChange={(event) => setBed(event.currentTarget.value)} /> King</label>
          <label><input type="radio" name="bed" value="twin" checked={bed === "twin"} onChange={(event) => setBed(event.currentTarget.value)} /> Twin</label>
        </fieldset>

        <div>
          <label><input type="checkbox" name="breakfast" checked={breakfast} onChange={(event) => setBreakfast(event.currentTarget.checked)} /> Breakfast included</label>
        </div>

        <button type="submit">Book room</button>
      </form>
    </main>
  );
}

const root = document.getElementById("react-root");
if (root) createRoot(root).render(<ReactForm />);
