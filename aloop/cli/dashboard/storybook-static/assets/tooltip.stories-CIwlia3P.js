import{j as o,T as n,a as i,b as s}from"./iframe-BdhXVlvH.js";import{B as p}from"./button-DEKvop-g.js";import"./preload-helper-C1FmrZbK.js";const B={title:"UI/Tooltip"},t={render:()=>o.jsxs(n,{children:[o.jsx(i,{asChild:!0,children:o.jsx(p,{variant:"outline",children:"Hover me"})}),o.jsx(s,{children:"Tooltip content"})]})},e={render:()=>o.jsxs(n,{children:[o.jsx(i,{asChild:!0,children:o.jsx(p,{variant:"outline",children:"Top tooltip"})}),o.jsx(s,{side:"top",children:"Appears on top"})]})},r={render:()=>o.jsxs(n,{children:[o.jsx(i,{asChild:!0,children:o.jsx(p,{variant:"outline",children:"Bottom tooltip"})}),o.jsx(s,{side:"bottom",children:"Appears on bottom"})]})};var a,l,d;t.parameters={...t.parameters,docs:{...(a=t.parameters)==null?void 0:a.docs,source:{originalSource:`{
  render: () => <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>Tooltip content</TooltipContent>
    </Tooltip>
}`,...(d=(l=t.parameters)==null?void 0:l.docs)==null?void 0:d.source}}};var c,T,m;e.parameters={...e.parameters,docs:{...(c=e.parameters)==null?void 0:c.docs,source:{originalSource:`{
  render: () => <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Top tooltip</Button>
      </TooltipTrigger>
      <TooltipContent side="top">Appears on top</TooltipContent>
    </Tooltip>
}`,...(m=(T=e.parameters)==null?void 0:T.docs)==null?void 0:m.source}}};var u,h,g;r.parameters={...r.parameters,docs:{...(u=r.parameters)==null?void 0:u.docs,source:{originalSource:`{
  render: () => <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Bottom tooltip</Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Appears on bottom</TooltipContent>
    </Tooltip>
}`,...(g=(h=r.parameters)==null?void 0:h.docs)==null?void 0:g.source}}};const v=["Default","TopSide","BottomSide"];export{r as BottomSide,t as Default,e as TopSide,v as __namedExportsOrder,B as default};
