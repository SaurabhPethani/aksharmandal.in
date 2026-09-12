import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '../components/ui';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary">
          <Compass className="h-7 w-7" />
        </span>
        <h1 className="page-title">Page not found</h1>
        <p className="text-sm text-text-muted">
          This page doesn’t exist, or your role doesn’t grant access to it.
        </p>
        <Link to="/dashboard">
          <Button variant="primary">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
