<script setup lang="ts">
import { computed, useId } from 'vue'

/** 品牌标识：对话气泡内嵌三个协作节点。矢量绘制，任意尺寸清晰。 */
const props = withDefaults(
  defineProps<{ size?: number; tailSide?: 'left' | 'right' }>(),
  { size: 28, tailSide: 'left' },
)

// 同一页面可能渲染多个实例，渐变 id 必须唯一。
const uid = useId()

/** 气泡小尾巴朝向：收起/展开时镜像，暗示侧栏的伸缩方向。 */
const flip = computed(() => (props.tailSide === 'right' ? 'scaleX(-1)' : 'none'))
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 1024 1024"
    role="img"
    aria-label="HelloAgents"
    class="brand-logo-svg"
    :style="{ transform: flip }"
  >
    <defs>
      <linearGradient :id="`${uid}-tile`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7C93FF" />
        <stop offset="0.55" stop-color="#4D6BFE" />
        <stop offset="1" stop-color="#3550E8" />
      </linearGradient>
      <linearGradient
        :id="`${uid}-bubble`"
        gradientUnits="userSpaceOnUse"
        x1="512"
        y1="196"
        x2="512"
        y2="700"
      >
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset="0.75" stop-color="#EDF2FF" />
        <stop offset="1" stop-color="#E4EBFF" />
      </linearGradient>
    </defs>

    <rect width="1024" height="1024" rx="232" :fill="`url(#${uid}-tile)`" />
    <rect
      x="26"
      y="26"
      width="972"
      height="972"
      rx="208"
      fill="none"
      stroke="#FFFFFF"
      stroke-opacity="0.16"
      stroke-width="8"
    />

    <rect x="176" y="196" width="672" height="464" rx="152" :fill="`url(#${uid}-bubble)`" />
    <path d="M286 596h152L302 780c-9 17-33 10-33-9z" :fill="`url(#${uid}-bubble)`" />

    <g stroke="#B4C2FF" stroke-width="46" stroke-linecap="round">
      <path d="M386 376h252" />
      <path d="M412 412l74 108" />
      <path d="M612 412l-74 108" />
    </g>
    <g fill="#4D6BFE">
      <circle cx="352" cy="376" r="78" />
      <circle cx="672" cy="376" r="78" />
      <circle cx="512" cy="560" r="78" />
    </g>
    <g fill="#FFFFFF" fill-opacity="0.94">
      <circle cx="352" cy="376" r="24" />
      <circle cx="672" cy="376" r="24" />
      <circle cx="512" cy="560" r="24" />
    </g>
  </svg>
</template>

<style scoped>
.brand-logo-svg {
  display: block;
  flex: none;
}
</style>
