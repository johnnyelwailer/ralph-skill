import{r as s,n as G,j as e,P as g,l as H,m as U,q as J,u as K,s as Q,i as V}from"./iframe-BdhXVlvH.js";import{B}from"./button-DEKvop-g.js";import"./preload-helper-C1FmrZbK.js";var C="Collapsible",[W]=V(C),[X,v]=W(C),M=s.forwardRef((t,o)=>{const{__scopeCollapsible:r,open:l,defaultOpen:n,disabled:c,onOpenChange:i,...b}=t,[p,d]=G({prop:l,defaultProp:n??!1,onChange:i,caller:C});return e.jsx(X,{scope:r,disabled:c,contentId:H(),open:p,onOpenToggle:s.useCallback(()=>d(h=>!h),[d]),children:e.jsx(g.div,{"data-state":j(p),"data-disabled":c?"":void 0,...b,ref:o})})});M.displayName=C;var $="CollapsibleTrigger",z=s.forwardRef((t,o)=>{const{__scopeCollapsible:r,...l}=t,n=v($,r);return e.jsx(g.button,{type:"button","aria-controls":n.contentId,"aria-expanded":n.open||!1,"data-state":j(n.open),"data-disabled":n.disabled?"":void 0,disabled:n.disabled,...l,ref:o,onClick:U(t.onClick,n.onOpenToggle)})});z.displayName=$;var N="CollapsibleContent",L=s.forwardRef((t,o)=>{const{forceMount:r,...l}=t,n=v(N,t.__scopeCollapsible);return e.jsx(J,{present:r||n.open,children:({present:c})=>e.jsx(Y,{...l,ref:o,present:c})})});L.displayName=N;var Y=s.forwardRef((t,o)=>{const{__scopeCollapsible:r,present:l,children:n,...c}=t,i=v(N,r),[b,p]=s.useState(l),d=s.useRef(null),h=K(o,d),y=s.useRef(0),w=y.current,O=s.useRef(0),R=O.current,x=i.open||b,T=s.useRef(x),u=s.useRef(void 0);return s.useEffect(()=>{const a=requestAnimationFrame(()=>T.current=!1);return()=>cancelAnimationFrame(a)},[]),Q(()=>{const a=d.current;if(a){u.current=u.current||{transitionDuration:a.style.transitionDuration,animationName:a.style.animationName},a.style.transitionDuration="0s",a.style.animationName="none";const P=a.getBoundingClientRect();y.current=P.height,O.current=P.width,T.current||(a.style.transitionDuration=u.current.transitionDuration,a.style.animationName=u.current.animationName),p(l)}},[i.open,l]),e.jsx(g.div,{"data-state":j(i.open),"data-disabled":i.disabled?"":void 0,id:i.contentId,hidden:!x,...c,ref:h,style:{"--radix-collapsible-content-height":w?`${w}px`:void 0,"--radix-collapsible-content-width":R?`${R}px`:void 0,...t.style},children:x&&n})});function j(t){return t?"open":"closed"}var Z=M;const k=Z,F=z,q=L,ne={title:"UI/Collapsible"},m={render:()=>{const[t,o]=s.useState(!1);return e.jsxs(k,{open:t,onOpenChange:o,className:"w-64",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx("span",{className:"text-sm font-medium",children:"Collapsible section"}),e.jsx(F,{asChild:!0,children:e.jsx(B,{variant:"ghost",size:"sm",children:t?"Close":"Open"})})]}),e.jsx(q,{className:"mt-2 text-sm text-muted-foreground",children:"This is the collapsible content that shows and hides."})]})}},f={render:()=>e.jsxs(k,{defaultOpen:!0,className:"w-64",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx("span",{className:"text-sm font-medium",children:"Always starts open"}),e.jsx(F,{asChild:!0,children:e.jsx(B,{variant:"ghost",size:"sm",children:"Toggle"})})]}),e.jsx(q,{className:"mt-2 text-sm text-muted-foreground",children:"Content visible by default."})]})};var _,E,A;m.parameters={...m.parameters,docs:{...(_=m.parameters)==null?void 0:_.docs,source:{originalSource:`{
  render: () => {
    const [open, setOpen] = useState(false);
    return <Collapsible open={open} onOpenChange={setOpen} className="w-64">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Collapsible section</span>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">{open ? 'Close' : 'Open'}</Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2 text-sm text-muted-foreground">
          This is the collapsible content that shows and hides.
        </CollapsibleContent>
      </Collapsible>;
  }
}`,...(A=(E=m.parameters)==null?void 0:E.docs)==null?void 0:A.source}}};var S,D,I;f.parameters={...f.parameters,docs:{...(S=f.parameters)==null?void 0:S.docs,source:{originalSource:`{
  render: () => <Collapsible defaultOpen className="w-64">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Always starts open</span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">Toggle</Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 text-sm text-muted-foreground">
        Content visible by default.
      </CollapsibleContent>
    </Collapsible>
}`,...(I=(D=f.parameters)==null?void 0:D.docs)==null?void 0:I.source}}};const ae=["Default","DefaultOpen"];export{m as Default,f as DefaultOpen,ae as __namedExportsOrder,ne as default};
