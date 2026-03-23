---
name: chakra-ui
description: Build UIs with Chakra UI components, layout primitives, and theming. Use when using Chakra UI, ChakraProvider, Box, Flex, Stack, or when the user mentions Chakra.
---

# Chakra UI

## When to Use

Apply this skill when building or refactoring interfaces with Chakra UI (v2 or v3): layout, forms, feedback components, theming, or provider setup.

## Version Note

- **Chakra v2**: Uses `ChakraProvider`, `theme` prop, `useToast`, `useColorMode`, and component props like `colorScheme`, `size`, `variant`.
- **Chakra v3**: Uses `Provider` with `value` (system), namespaced components (e.g. `Dialog.Root`, `Dialog.Content`), `toaster` API, and often `next-themes` for color mode. Theme is built with `createSystem` and tokens use `{ value: ... }`.

When editing existing code, match the version already in the project.

## Layout Primitives

- **Box**: Generic container; use for custom layout or when no semantic component fits. Props: `p`, `px`, `py`, `m`, `maxW`, `minH`, `bg`, `borderRadius`, etc.
- **Flex**: Flexbox container. Use `direction`, `align`, `justify`, `wrap`, `gap` (or `gridGap` in v2).
- **Stack**: Vertical or horizontal stack with consistent `spacing`. Use `Stack` (column), `HStack`, `VStack`; props: `spacing`, `align`, `direction`.
- **Grid**: CSS Grid. Use `templateColumns`, `templateRows`, `gap`, `columnGap`, `rowGap`.
- **Center**: Centers children (flex with `align="center"` and `justify="center"`).
- **SimpleGrid**: Grid with `columns` (and `minChildWidth` for responsive columns).

Prefer `Stack`/`HStack`/`VStack` for linear layouts; use `Flex` when you need specific flex behavior; use `Grid`/`SimpleGrid` for grid layouts.

## Common Components

- **Button**: `Button` with `colorScheme`, `variant` (solid, outline, ghost, link), `size` (sm, md, lg), `leftIcon`/`rightIcon`, `isLoading`, `isDisabled`.
- **Input / FormControl**: Wrap inputs in `FormControl` with `FormLabel`, `FormErrorMessage`, `FormHelperText`. Use `Input`, `InputGroup`, `InputLeftAddon` for addons. `isInvalid`, `isRequired` on `FormControl`.
- **Text**: `Text` for paragraphs; use `as="span"`, `as="p"` when semantics matter. Props: `fontSize`, `fontWeight`, `color`, `noOfLines` (truncation).
- **Heading**: Semantic headings with `as="h1"` … `as="h6"`. Use `size` for visual scale.
- **Badge**: `Badge` with `colorScheme`, `variant` (solid, outline, subtle).
- **Alert**: `Alert`, `AlertIcon`, `AlertTitle`, `AlertDescription`; use `status` (success, error, warning, info).
- **Modal/Dialog**: v2: `Modal`, `ModalOverlay`, `ModalContent`, `ModalHeader`, `ModalBody`, `ModalFooter`, `ModalCloseButton`. v3: `Dialog.Root`, `Dialog.Trigger`, `Dialog.Backdrop`, `Dialog.Content`, etc.
- **Toast**: v2: `useToast()` and `toast()`. v3: `toaster` API (e.g. `toast.success`, `toast.error`).

## Theming and Tokens

- Use theme tokens for colors, spacing, radii, shadows: e.g. `bg="gray.100"`, `color="blue.600"`, `borderRadius="md"`, `shadow="sm"`.
- Semantic tokens (e.g. `bg="background"`, `color="text")` keep light/dark consistent when using color mode.
- v2: extend `theme` in `extendTheme()` and pass to `ChakraProvider`. v3: extend via `createSystem(defaultConfig, { theme: { tokens: { ... } } })`.

## Responsive and Conditional Props

- **Responsive**: Use array or object syntax: `p={[2, 4, 6]}`, `display={{ base: "block", md: "flex" }}`.
- **Conditional**: Pass props conditionally: `isDisabled={isLoading}`, `colorScheme={isError ? "red" : "blue"}`.

## Accessibility

- Prefer Chakra’s composed components (e.g. `Modal`, `Menu`, `Tabs`) so focus and ARIA are handled.
- Use `aria-*` and `role` when building custom interactive elements; pair with `focusVisible` styling.
- Form labels and errors should be associated (Chakra’s `FormControl` does this when used correctly).

## Example (v2-style)

```tsx
<Stack spacing={4}>
  <Heading size="md">Form</Heading>
  <FormControl isInvalid={!!errors.name} isRequired>
    <FormLabel>Name</FormLabel>
    <Input
      placeholder="Name"
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
    <FormErrorMessage>{errors.name}</FormErrorMessage>
  </FormControl>
  <HStack spacing={2} justify="flex-end">
    <Button variant="ghost" onClick={onCancel}>Cancel</Button>
    <Button colorScheme="blue" isLoading={isSubmitting} type="submit">
      Submit
    </Button>
  </HStack>
</Stack>
```

## What to Avoid

- Inline styles for values that exist in the theme (use token names).
- Skipping `FormControl`/labels for form fields (hurts accessibility and consistency).
- Mixing raw HTML layout (e.g. plain `div` + custom CSS) when Chakra layout primitives would suffice.
