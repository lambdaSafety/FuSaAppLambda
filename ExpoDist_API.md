# 공통 지수 분포 계산 API와 수식

현재 **확률 → 지수 분포**와 **안전분석 → FTA**의 기본사상 계산기가 같은 지수 분포 계산 모듈을 사용한다. 입력 화면과 그래프 표시는 [지수 분포 계산기](./subMenu_01_ExpoDist.md)에 있다.

## 다른 모듈에서 호출

[작업공간](./docs/index.html)은 [공통 계산 모듈](./docs/expo-model.js), [그래프](./docs/expo-chart.js), [계산기 화면](./docs/expo-calculator.js) 순으로 스크립트를 로드한다. 같은 페이지의 모듈은 `exponentialDistribution.calculate(mode, parameters)`로 미션 시간의 확률과 순간 고장 빈도를 얻는다. 공통 모듈에서 두 화면의 입력을 검증하고 수치 안정화와 검사 시점 규칙을 적용한다.

| `mode` | 필수 `parameters` 키 |
| --- | --- |
| `non-repair` | `lambda`, `t` |
| `repair` | `lambda`, `t`, `mu` |
| `monitoring` | `lambda`, `t`, `tau` |

입력은 0 이상의 유한한 JavaScript 숫자 또는 십진수·과학적 표기 문자열을 사용한다. 문자열은 앞뒤 공백을 제거한 길이가 128자 이하여야 한다. 0이 아닌 값은 `Number`로 변환했을 때 유한하며 0보다 커야 한다. `t`와 `tau`는 시간(h), `lambda`와 `mu`는 시간당 비율(h⁻¹)이다. 단위는 호출 모듈에서 맞춘다. FIT 단위의 고장률을 전달할 때는 1 FIT = 10⁻⁹ h⁻¹로 환산한다. 사용자가 입력한 십진 검사 시점을 그대로 판정하려면 `t`와 `tau`의 원본 문자열을 전달한다.

```js
const result = exponentialDistribution.calculate('monitoring', {
  lambda: '1e-8',
  t: '0.3',
  tau: '0.1'
});

if (result.ok) {
  const { probability, frequency } = result;
  // 기본사상의 확률과 시간당 순간 고장 빈도로 사용한다.
} else {
  // result.fields에 값이 없거나 유효하지 않은 필드 이름이 들어 있다.
}
```

성공 시 `{ ok: true, probability, frequency }`를 반환한다. `probability`는 0부터 1까지의 무차원 값이며 `frequency`는 h⁻¹이다. 결과는 표시용 반올림을 적용하기 전의 숫자다. 필수 입력이 비었거나 값이 유효하지 않으면 `{ ok: false, fields: [...] }`를 반환한다. 지원 목록에 없는 모델 이름은 `RangeError`로 처리한다.

계산기 화면은 `exponentialDistribution.prepare(mode, parameters)`로 결과와 그래프에 필요한 표본 함수를 함께 얻는다. 검증에 성공하면 `{ ok: true, inputs, result, sample }`을 반환한다. `inputs`는 변환한 숫자를 담은 읽기 전용 객체이며, 모델에 쓰이지 않는 필드는 0이다. `result`는 같은 입력으로 `calculate`를 호출한 결과와 같다. `sample(time, age)`는 지정한 시각의 확률과 빈도를 반환한다. 주기 검사 그래프는 구간 경과 시간 `age`를 직접 넘겨 검사 직전과 직후를 그린다. 생략한 `age`의 기본값은 0이다. 미션 시간의 정확한 검사 시점 판정은 `calculate`의 반환값과 `prepare`의 `result`에 적용된다. 검증 오류 형식은 두 함수가 같다.

## 확률과 Frequency

세 모델 모두 미션 시작 시 부품이 정상이라고 가정한다. 고장 확률은 $P(t)$로 나타낸다. Frequency는 순간 고장 발생 빈도로, 고장률 λ에 시각 $t$의 정상 상태 확률을 곱한 값이다. 단위는 h⁻¹이다.

### 비수리 (Non-repair)

부품은 고장 후 복구되지 않는다. $P(t)$는 미션 시간까지 고장이 발생했을 확률이다.

$$
P(t)=1-e^{-\lambda t},\qquad f(t)=\lambda e^{-\lambda t}.
$$

### 수리 (Repair)

고장률 λ와 수리율 μ가 일정한 두 상태 모형을 사용한다. 수리가 완료되면 부품은 초기 정상 상태와 동일한 조건으로 돌아간다. $P(t)$는 시각 $t$에 부품이 고장 상태일 확률이다.

$$
k=\lambda+\mu,\qquad
P(t)=\frac{\lambda}{k}\left(1-e^{-kt}\right),\qquad
f(t)=\lambda\left(\frac{\mu}{k}+\frac{\lambda}{k}e^{-kt}\right)\quad(k>0).
$$

$k=0$이면 두 결과는 모두 0이다. μ가 0이면 비수리 모델과 결과가 같다. $f(t)$는 정상 상태에서 고장 상태로 들어가는 빈도이므로, 수리를 포함한 순 고장 상태 증가율 $dP(t)/dt$와 구분한다.

### 주기 검사 (Monitoring)

정기 검사에서 발견한 고장을 즉시 수리하거나 해당 부품을 교체한다고 가정한다. $a$는 마지막 검사 직후부터 흐른 시간으로, 양의 정수 배 검사 시각에서는 검사 직전 값을 사용한다.

$$
a(t,\tau)=
\begin{cases}
0 & t=0\ \text{또는}\ \tau=0,\\
\tau & \tau>0,\ t>0,\ t\bmod\tau=0,\\
t\bmod\tau & \text{그 외}.
\end{cases}
$$

$$
P(t)=1-e^{-\lambda a(t,\tau)},\qquad f(t)=\lambda e^{-\lambda a(t,\tau)}.
$$

그래프의 표시 범위 안쪽 검사 시각에는 검사 직전 값과 검사 직후의 우극한을 그린다. 검사 직후에는 $a=0$이므로 $P=0$, $f=\lambda$다. τ가 0이면 모든 시각에 $a=0$을 적용한다.

## 수치 계산과 검증

- 확률 항 $1-e^{-x}$는 `Math.abs(Math.expm1(-x))`로 계산해 작은 $x$에서 유효숫자가 사라지는 문제를 줄인다.
- 수리 모델의 λ+μ와 비율은 큰 쪽 고장률 또는 수리율을 기준으로 스케일링한다. Frequency는 정상 상태 확률을 직접 구해 뺄셈으로 인한 정밀도 손실을 줄인다. 지수 감쇠가 매우 크면 고장률과 지수의 곱을 로그 영역에서 계산해 표현 가능한 결과를 보존한다.
- 모니터링의 미션 시간과 간격은 사용자가 입력한 십진수에서 공통 자리수를 정하고, `BigInt` 정수 나머지로 정확한 검사 시각과 경과 시간을 판별한다. 경과 시간과 고장률의 곱까지 십진 정수로 계산한 뒤 지수 함수에 전달할 때 `Number`로 변환한다. 경과 시간이 매우 작아도 표현 가능한 곱을 보존한다.
- 화면에 표시할 반올림은 계산 이후에 적용한다. 지수 계산과 최종 결과의 정밀도 및 범위는 JavaScript `Number`의 IEEE 754 배정밀도 표현에 따른다.

| 확인 항목 | 기대 결과 |
| --- | --- |
| 같은 모델과 입력으로 두 화면에서 계산 | 확률과 Frequency가 일치 |
| 모델별 필수 입력 | 수리는 `mu`, 주기 검사는 `tau`가 없으면 해당 키를 검증 오류로 반환 |
| 초기값 λ = 1e-8, t = 1000, μ = 0.1, τ = 340 | 비수리 확률 약 9.99995000017e-6, 수리 확률 약 9.99999900000e-8, 주기 검사 확률 약 3.19999488001e-6 |
| t = 0 | 모든 확률 0, Frequency는 λ |
| λ = 0 | 모든 확률과 Frequency 0 |
| μ = 0 | 수리 결과가 비수리 결과와 일치 |
| t = 0.3, τ = 0.1 | 십진수의 정확한 검사 시각으로 처리하고 검사 직전 경과 시간 0.1 h를 사용 |
| τ = 0 | 모니터링 확률 0, Frequency는 λ |
| λ = 1e-20, t = 1 | 비수리 확률이 0으로 소실되지 않고 약 1e-20 |
| λ = 1e308, t = 1.000000000000000001e-310, τ = 1e-310 | 주기 검사 확률이 경과 시간의 선행 반올림으로 0이 되지 않고 약 1e-20 |

비수리 지수 분포의 확률과 밀도, 수리·주기 검사 모델 및 이중 축 그래프는 다음 자료를 참조한다. [NIST 지수 분포](https://www.itl.nist.gov/div898/handbook/apr/section1/apr161.htm) · [Ansys FTA 확률 모델](https://ansyshelp.ansys.com/public/Views/Secured/medini/v252/en/medini_analyze_ug/fta.html)
