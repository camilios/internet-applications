// Browser geometry and navigation checks, using the isolated real-application harness.
import assert from "node:assert/strict"

export async function checkResponsiveLayouts(context) {
  const { cdp, evaluate, until, pause, newTab, screenshot, adminUser, adminToken,
    ownerUser, ownerToken, productId, dashboard, customer, customerList, adminApproval, onLayout } = context
  const pages = [
    { name: "admin-dashboard", tab: dashboard },
    { name: "customer-orders", tab: customerList },
    { name: "customer-order-detail", tab: customer },
    { name: "admin-order-detail", tab: adminApproval },
    { name: "products", tab: await newTab(adminUser, adminToken, "/products") },
    { name: "product-detail", tab: await newTab(ownerUser, ownerToken, `/products/${productId}`) },
    { name: "product-form", tab: await newTab(adminUser, adminToken, "/products/new") },
    { name: "users", tab: await newTab(adminUser, adminToken, "/users") },
    { name: "settings", tab: await newTab(ownerUser, ownerToken, "/settings") },
    { name: "login", tab: await newTab(null, null, "/login") },
    { name: "register", tab: await newTab(null, null, "/register") },
  ]
  const viewports = [
    [320, 740], [375, 812], [568, 320], [640, 800], [720, 900],
    [768, 900], [960, 900], [1024, 768], [1280, 900], [1920, 1080],
  ]
  async function resize(tab, width, height = 900) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, tab.sessionId)
    await pause(400) // Wait for media-query updates and the sidebar's width/margin transition.
  }
  const results = []
  for (const page of pages) {
    await until(() => evaluate(page.tab, "!document.querySelector('[data-global-spinner]') && document.readyState === 'complete'"), `loaded ${page.name}`)
    for (const [width, height] of viewports) {
      await resize(page.tab, width, height)
      const geometry = await evaluate(page.tab, `(() => {
        const main = document.querySelector('main');
        const sidebar = document.querySelector('#app-sidebar');
        const rect = main?.getBoundingClientRect();
        return {
          viewport: innerWidth, contentWidth: document.documentElement.clientWidth, document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          mainWidth: rect?.width ?? null, mainLeft: rect?.left ?? null, mainRight: rect?.right ?? null,
          drawerClosed: !document.querySelector('[role="dialog"]#app-sidebar'),
          sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
          menuVisible: !!document.querySelector('#sidebar-toggle'),
          visibleCards: [...document.querySelectorAll('ul[aria-label="قائمة البيانات"] > li')].filter(el => el.getClientRects().length).length,
        };
      })()`)
      assert.equal(geometry.viewport, width)
      assert.ok(geometry.document <= width + 1, `${page.name} ${width}: document overflows: ${JSON.stringify(geometry)}`)
      assert.ok(geometry.body <= width + 1, `${page.name} ${width}: body overflows`)
      if (geometry.mainWidth !== null) {
        assert.ok(geometry.mainLeft >= -1 && geometry.mainRight <= geometry.contentWidth + 1, `${page.name} ${width}: content stays inside the viewport: ${JSON.stringify(geometry)}`)
        assert.ok(geometry.drawerClosed, `${page.name} ${width}: drawer must remain closed on resize`)
        assert.equal(geometry.menuVisible, width < 1024)
        if (width < 1024) {
          assert.equal(geometry.sidebarWidth, 0)
          assert.ok(Math.abs(geometry.mainWidth - geometry.contentWidth) < 2, `${page.name} ${width}: closed drawer reserves no page width: ${JSON.stringify(geometry)}`)
        }
      }
      if (page.name === "customer-orders") {
        assert.equal(geometry.visibleCards > 0, width < 1024, "Orders use visible cards only at narrow widths")
      }
      const entry = { page: page.name, width, height, ...geometry }
      results.push(entry)
      onLayout?.(entry)
      if ((page.name === "customer-orders" && [375, 720].includes(width)) ||
          (page.name === "admin-order-detail" && width === 720) ||
          (page.name === "admin-dashboard" && width === 1280) ||
          (page.name === "products" && width === 375)) {
        await screenshot(page.tab, `${page.name}-${width}.png`)
      }
    }
  }

  const navigation = pages.find(page => page.name === "settings").tab
  await resize(navigation, 720)
  await evaluate(navigation, "document.querySelector('#sidebar-toggle').click()")
  await until(() => evaluate(navigation, "!!document.querySelector('[role=dialog]#app-sidebar')"), "drawer opens")
  assert.ok(await evaluate(navigation, "document.querySelector('#app-sidebar').contains(document.activeElement)"), "Drawer receives keyboard focus")
  for (let index = 0; index < 8; index++) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, navigation.sessionId)
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, navigation.sessionId)
    assert.ok(await evaluate(navigation, "document.querySelector('#app-sidebar').contains(document.activeElement)"), "Keyboard focus stays inside open drawer")
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, navigation.sessionId)
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, navigation.sessionId)
  await until(() => evaluate(navigation, "!document.querySelector('[role=dialog]#app-sidebar') && document.activeElement?.id === 'sidebar-toggle'"), "Escape closes drawer and restores focus")
  await evaluate(navigation, "document.querySelector('#sidebar-toggle').click()")
  await until(() => evaluate(navigation, "!!document.querySelector('#app-sidebar nav a')"), "drawer reopens")
  await evaluate(navigation, "document.querySelector('#app-sidebar nav a[href=\"/orders\"]').click()")
  await until(() => evaluate(navigation, "location.pathname === '/orders' && !document.querySelector('[role=dialog]#app-sidebar')"), "navigation closes drawer")

  await resize(navigation, 1280)
  await evaluate(navigation, "document.querySelector('#app-sidebar button[aria-label=\"طي القائمة\"]').click()")
  await pause(400)
  assert.equal(await evaluate(navigation, "document.querySelector('#app-sidebar').getBoundingClientRect().width"), 64)
  await resize(navigation, 720)
  assert.ok(await evaluate(navigation, "!document.querySelector('#app-sidebar') && document.querySelector('main').getBoundingClientRect().width === document.documentElement.clientWidth"), "Resizing collapsed desktop into split screen frees all content width")

  // Menus must fit even the smallest supported viewport.
  await resize(customerList, 320)
  await cdp.send("Page.bringToFront", {}, customerList.sessionId)
  const bell = await evaluate(customerList, "(() => { const r=document.querySelector('button[aria-label=\"الإشعارات\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()")
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", { type, ...bell, button: "left", clickCount: 1 }, customerList.sessionId)
  }
  await until(() => evaluate(customerList, "!!document.querySelector('[role=menu]')"), "notification menu")
  const menu = await evaluate(customerList, "(() => { const r=document.querySelector('[role=menu]').getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width}; })()")
  assert.ok(menu.left >= 0 && menu.right <= 321, `Notification menu fits phone: ${JSON.stringify(menu)}`)
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, customerList.sessionId)
  return results
}
