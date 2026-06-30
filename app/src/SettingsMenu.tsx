import { useState } from "react";
import { Button, Flex, Modal, Switch, Tooltip, Typography } from "antd";
import {
  BulbOutlined,
  ColumnWidthOutlined,
  CompressOutlined,
  MoonOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useTheme } from "./theme";

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { mode, setMode, fullWidth, setFullWidth } = useTheme();

  return (
    <>
      <Tooltip title="Settings">
        <Button
          type="text"
          shape="circle"
          aria-label="Open settings"
          icon={<SettingOutlined />}
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            zIndex: 0,
          }}
        />
      </Tooltip>

      <Modal
        title="Settings"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Flex vertical gap="middle" style={{ marginTop: 8 }}>
          <Flex align="center" justify="space-between">
            <Typography.Text>Dark theme</Typography.Text>
            <Switch
              checked={mode === "dark"}
              onChange={(checked) => setMode(checked ? "dark" : "light")}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<BulbOutlined />}
            />
          </Flex>
          <Flex align="center" justify="space-between">
            <Typography.Text>Full width</Typography.Text>
            <Switch
              checked={fullWidth}
              onChange={setFullWidth}
              checkedChildren={<ColumnWidthOutlined />}
              unCheckedChildren={<CompressOutlined />}
            />
          </Flex>
        </Flex>
      </Modal>
    </>
  );
}

export default SettingsMenu;
