import { useState } from "react";
import { Button, Flex, Modal, Switch, Tooltip, Typography } from "antd";
import {
  BulbOutlined,
  MoonOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useTheme } from "./theme";

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { mode, setMode } = useTheme();

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
        <Flex align="center" justify="space-between" style={{ marginTop: 8 }}>
          <Typography.Text>Dark theme</Typography.Text>
          <Switch
            checked={mode === "dark"}
            onChange={(checked) => setMode(checked ? "dark" : "light")}
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<BulbOutlined />}
          />
        </Flex>
      </Modal>
    </>
  );
}

export default SettingsMenu;
