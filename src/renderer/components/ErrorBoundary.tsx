import { Component, type ReactNode } from "react";

// Without a boundary one failing component unmounts the whole tree and the window goes blank.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center text-lol-text-bright">
        <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
        <pre className="max-w-[720px] whitespace-pre-wrap text-[13px] text-lol-loss">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-lol-crimson px-5 py-2 font-display text-[13px] font-semibold text-white"
        >
          Reload
        </button>
      </div>
    );
  }
}
