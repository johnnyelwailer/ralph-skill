import{r as s,j as e,h as t}from"./iframe-BdhXVlvH.js";import"./preload-helper-C1FmrZbK.js";const d=s.forwardRef(({className:r,...a},n)=>e.jsx("div",{ref:n,className:t("rounded-lg border bg-card text-card-foreground shadow-sm",r),...a}));d.displayName="Card";const p=s.forwardRef(({className:r,...a},n)=>e.jsx("div",{ref:n,className:t("flex flex-col space-y-1.5 p-6",r),...a}));p.displayName="CardHeader";const C=s.forwardRef(({className:r,...a},n)=>e.jsx("h2",{ref:n,className:t("text-lg font-semibold leading-none tracking-tight",r),...a}));C.displayName="CardTitle";const m=s.forwardRef(({className:r,...a},n)=>e.jsx("p",{ref:n,className:t("text-sm text-muted-foreground",r),...a}));m.displayName="CardDescription";const o=s.forwardRef(({className:r,...a},n)=>e.jsx("div",{ref:n,className:t("p-6 pt-0",r),...a}));o.displayName="CardContent";d.__docgenInfo={description:"",methods:[],displayName:"Card"};p.__docgenInfo={description:"",methods:[],displayName:"CardHeader"};C.__docgenInfo={description:"",methods:[],displayName:"CardTitle"};m.__docgenInfo={description:"",methods:[],displayName:"CardDescription"};o.__docgenInfo={description:"",methods:[],displayName:"CardContent"};const T={title:"UI/Card",component:d},i={render:()=>e.jsxs(d,{className:"w-80",children:[e.jsxs(p,{children:[e.jsx(C,{children:"Card Title"}),e.jsx(m,{children:"Card description goes here."})]}),e.jsx(o,{children:e.jsx("p",{children:"Card content."})})]})},c={render:()=>e.jsxs(d,{className:"w-80",children:[e.jsx(p,{children:e.jsx(C,{children:"No Description"})}),e.jsx(o,{children:e.jsx("p",{children:"Content without description."})})]})},l={render:()=>e.jsx(d,{className:"w-80",children:e.jsx(o,{className:"pt-6",children:e.jsx("p",{children:"Content only, no header."})})})};var h,x,N;i.parameters={...i.parameters,docs:{...(h=i.parameters)==null?void 0:h.docs,source:{originalSource:`{
  render: () => <Card className="w-80">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content.</p>
      </CardContent>
    </Card>
}`,...(N=(x=i.parameters)==null?void 0:x.docs)==null?void 0:N.source}}};var f,j,u;c.parameters={...c.parameters,docs:{...(f=c.parameters)==null?void 0:f.docs,source:{originalSource:`{
  render: () => <Card className="w-80">
      <CardHeader>
        <CardTitle>No Description</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Content without description.</p>
      </CardContent>
    </Card>
}`,...(u=(j=c.parameters)==null?void 0:j.docs)==null?void 0:u.source}}};var g,y,w;l.parameters={...l.parameters,docs:{...(g=l.parameters)==null?void 0:g.docs,source:{originalSource:`{
  render: () => <Card className="w-80">
      <CardContent className="pt-6">
        <p>Content only, no header.</p>
      </CardContent>
    </Card>
}`,...(w=(y=l.parameters)==null?void 0:y.docs)==null?void 0:w.source}}};const H=["Default","WithoutDescription","ContentOnly"];export{l as ContentOnly,i as Default,c as WithoutDescription,H as __namedExportsOrder,T as default};
