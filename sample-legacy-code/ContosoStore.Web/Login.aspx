<%@ Page Title="Login" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true"
    CodeBehind="Login.aspx.cs" Inherits="ContosoStore.Web.Login" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
  <h1>Sign in</h1>
  <asp:Label runat="server" AssociatedControlID="txtEmail" Text="Email" />
  <asp:TextBox ID="txtEmail" runat="server" />
  <asp:RequiredFieldValidator ControlToValidate="txtEmail" runat="server"
       ErrorMessage="Email required" Display="Dynamic" />
  <asp:Label runat="server" AssociatedControlID="txtPassword" Text="Password" />
  <asp:TextBox ID="txtPassword" runat="server" TextMode="Password" />
  <asp:Button ID="btnLogin" runat="server" Text="Sign in" OnClick="btnLogin_Click" />
  <asp:Label ID="lblError" runat="server" ForeColor="Red" />
</asp:Content>
