import { Link } from "react-router-dom";

// Optional helper component to place lightweight navigation hints between capture steps
export const CaptureNavHint = () => (
  <nav className="mt-4 text-center text-sm text-muted-foreground">
    <Link className="underline" to="/capture">Switch to Video</Link>
  </nav>
);
