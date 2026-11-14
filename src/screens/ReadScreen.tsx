import { EmptyState } from '../components/common';
import { navigate } from '../lib/router';

/** 閲覧モード（読む）。7a-2 で、回・分野ごとに問題と解説を読める画面にする。いまは入口だけ */
export function ReadScreen() {
  return (
    <div className="screen">
      <h1 className="screen-title">読む</h1>
      <div className="card">
        <EmptyState
          icon="book"
          title="閲覧モードは準備中です"
          action={
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/setup')}>
              問題を解く
            </button>
          }
        >
          <p>解答せずに、問題と解説を順番に読める画面を作っています。回や分野を選んで、通学中に教科書のように読み進められるようになります。</p>
        </EmptyState>
      </div>
    </div>
  );
}
