import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <h2 className="text-lg font-bold mb-2">تعذر عرض المحتوى</h2>
          <p className="text-sm">حدث خطأ أثناء محاولة عرض النص المنسق. يمكنك تنزيل الملف مباشرة بصيغة Word أو نص عادي.</p>
          <pre className="mt-4 p-2 bg-red-100/50 rounded-lg text-xs overflow-auto max-h-32 text-left" dir="ltr">
            {this.state.error?.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
