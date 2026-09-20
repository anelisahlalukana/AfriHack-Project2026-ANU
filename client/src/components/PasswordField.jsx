import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// A password box with a show/hide button, so someone who can't sign in can check what they typed
// before blaming the password. Every form using it reads its value from the DOM on submit, so this
// only ever owns whether the characters are visible; it never holds the password itself.
// Starts hidden on every mount, and any other input attribute is passed straight through.
export default function PasswordField({ label, hint, ...inputProps }) {
  const [shown, setShown] = useState(false)

  return <label>{label}
    <span className="password-field">
      <input {...inputProps} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShown(visible => !visible)}
        disabled={inputProps.disabled}
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
      >
        {shown ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
    {hint && <small>{hint}</small>}
  </label>
}
