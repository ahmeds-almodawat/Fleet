import React from 'react';
import { Button } from '@/components/ui/button';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, message: error?.message ?? String(error) };
  }

  componentDidCatch(error: any, info: any) {
     
    console.error('UI crash caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-lg w-full rounded-lg border bg-card p-6 space-y-4">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              A page crashed due to a frontend error. This is usually safe to fix by refreshing.
            </p>
            {this.state.message ? (
              <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-3 overflow-auto">
                {this.state.message}
              </pre>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()}>Reload</Button>
              <Button variant="outline" onClick={() => this.setState({ hasError: false, message: undefined })}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
