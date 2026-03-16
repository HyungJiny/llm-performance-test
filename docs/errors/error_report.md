# 프로젝트 트러블슈팅 및 에러 해결 보고서

## 1. Chart.js 캔버스 리셋 충돌 (Canvas is already in error state)
**현상:**
- 사용자가 테스트를 시작하고, 중지 혹은 종료 후 **다시 Start Test 버튼을 눌러 새로운 테스트를 반복 시행**할 때 발생.
- JS 에러 로그: `Error: CanvasRenderingContext2D.resetTransform: Canvas is already in error state.` 발생 후 테스트 진행 중단 및 버튼 비활성화 상태 고착.

**원인:**
- 새로운 테스트 시작 시 기존 `chart.data.datasets` 배열만 비운 뒤 `chart.update()`를 호출하는 방식 사용.
- 이때 Chart.js 내부적으로 이전 상태의 CanvasContext가 남아있는 상태에서 완전히 리셋되지 못하고 충돌. 특히 `chart.destroy()`를 호출해도 DOM 트리 상에 기존 `<canvas>` 태그가 남아있어 다시 인스턴스화할 때 이슈가 지속됨.

**해결 방안:**
- 단지 차트 데이터를 비우거나 인스턴스를 `destroy` 하는 데 그치지 않고, 자바스크립트를 이용해 대상 부모 래퍼(`canvas-holder` DOM 요소)의 `innerHTML`을 강제로 덮어써서 **`<canvas>` DOM 태그 자체를 완전 소멸 후 재생성** 하도록 로직 변경.
- 수정 사항 (`app.js`):
  ```js
  const containerLat = document.getElementById('chart-latency').parentElement;
  containerLat.innerHTML = '<canvas id="chart-latency"></canvas>';
  // 이후 new Chart(...) 로 완전히 새로운 인스턴스에 결합
  ```

---

## 2. 차트 레이아웃 세로 팽창 문제 (Infinite Y-Axis Scaling)
**현상:**
- 테스트 파이프라인에서 렌더링 될 때, Latency와 TPS 차트 컨테이너가 데이터가 누적됨에 따라 화면 아래쪽으로 무한정 늘어나는 증상 발생.

**원인:**
- Chart.js는 부모 래퍼 컨테이너가 엄격한 `height` 제한이나 `relative` 포지셔닝 속성을 갖고 있지 않으면, 뷰포트를 채우기 위해 캔버스 비율(AspectRatio)을 유지하려는 로직과 CSS 간섭이 일어남. 이로 인해 리렌더 트리거마다 높이가 증가하는 고질적 이슈 발생.

**해결 방안:**
- 시각화를 담는 캔버스를 `canvas-holder` 라는 새로운 전용 wrapper 클래스로 감쌈.
- `style.css`에서 부모인 `charts-container`에 `max-height`를 고정하고, `canvas-holder` 에는 `position: relative`, `flex-grow: 1`, `height: 100%` 속성을 완전히 강제 부여하여 외부 컨테이너를 절대 벗어나지 못하도록 레이아웃 제약 설정.
