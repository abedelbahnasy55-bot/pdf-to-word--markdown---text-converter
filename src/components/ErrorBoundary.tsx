import { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home, ChevronDown } from 'lucide-react';
import { clearBatchSession } from '../utils/historyStorage';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  recoveryKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    recoveryKey: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error intercepted by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryKey: prev.recoveryKey + 1,
    }));
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleResetToHome = async () => {
    try {
      await clearBatchSession();
    } catch (e) {
      console.warn('Could not clear batch session during emergency reset:', e);
    }
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryKey: prev.recoveryKey + 1,
    }));
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0D12] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 font-sans transition-colors" dir="rtl">
          <div className="max-w-lg w-full bg-white dark:bg-[#141720] rounded-2xl shadow-lg border border-slate-200 dark:border-[#232938] p-6 sm:p-8 text-center">
            <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-200 dark:border-red-500/30">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              تم حماية الجلسة وتفادي توقف العرض
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              حدث خلل مؤقت أثناء عرض الواجهة. جميع ملفاتك ومهام الخلفية محفوظة بأمان ويمكنك المتابعة فوراً.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>استئناف العمل مباشرة</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetToHome}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] text-slate-800 dark:text-slate-200 font-semibold text-sm transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>العودة للرئيسية</span>
              </button>
            </div>

            <div className="border-t border-slate-200 dark:border-[#232938] pt-4 text-right">
              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-between w-full cursor-pointer py-1"
              >
                <span>تفاصيل الخطأ التقني</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${this.state.showDetails ? 'rotate-180' : ''}`} />
              </button>

              {this.state.showDetails && (
                <div className="mt-2 p-3 bg-slate-100 dark:bg-[#0E1118] rounded-xl text-left font-mono text-xs text-red-700 dark:text-red-400 overflow-x-auto max-h-40" dir="ltr">
                  <p className="font-bold">{this.state.error?.name}: {this.state.error?.message}</p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 opacity-80 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return <div key={this.state.recoveryKey}>{this.props.children}</div>;
  }
}
